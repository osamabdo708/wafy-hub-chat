import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Plus, Trash2, Bot, User, Mail, Lock, Upload, Eye, EyeOff, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import genieIcon from "@/assets/agent-icon.png";

interface Agent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  is_ai: boolean;
  is_system: boolean;
  is_user_agent: boolean;
  workspace_id: string;
  created_at: string;
  user_id: string | null;
}

const Agents = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentEmail, setNewAgentEmail] = useState("");
  const [newAgentPassword, setNewAgentPassword] = useState("");
  const [newAgentAvatarUrl, setNewAgentAvatarUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaceAndAgents();
  }, []);

  const fetchWorkspaceAndAgents = async () => {
    try {
      // Get current user's workspace
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (wsError) throw wsError;
      
      if (!workspace) {
        setLoading(false);
        return;
      }

      setWorkspaceId(workspace.id);

      // Fetch agents for this workspace
      const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: true });

      if (agentsError) throw agentsError;

      setAgents(agentsData || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error("فشل في تحميل الوكلاء");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async () => {
    if (!newAgentName.trim() || !newAgentEmail.trim() || !newAgentPassword.trim() || !workspaceId) {
      toast.error("الرجاء ملء جميع الحقول المطلوبة");
      return;
    }

    if (newAgentPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newAgentEmail)) {
      toast.error("الرجاء إدخال بريد إلكتروني صحيح");
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-agent-user', {
        body: {
          name: newAgentName.trim(),
          email: newAgentEmail.trim().toLowerCase(),
          password: newAgentPassword,
          avatar_url: newAgentAvatarUrl.trim() || null,
          workspace_id: workspaceId,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }

      toast.success("تم إضافة الوكيل بنجاح");
      resetForm();
      setShowAddDialog(false);
      fetchWorkspaceAndAgents();
    } catch (error: any) {
      console.error('Error adding agent:', error);
      if (error.message?.includes('already registered') || error.message?.includes('duplicate')) {
        toast.error("هذا البريد الإلكتروني مسجل بالفعل");
      } else {
        toast.error(error.message || "فشل في إضافة الوكيل");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteAgentId) return;

    const agentToDelete = agents.find(a => a.id === deleteAgentId);
    if (!agentToDelete) return;

    setIsDeleting(true);

    try {
      if (agentToDelete.is_user_agent && agentToDelete.user_id) {
        // Use edge function to delete user agent
        const { data, error } = await supabase.functions.invoke('delete-agent-user', {
          body: { agent_id: deleteAgentId },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);
      } else {
        // Simple delete for non-user agents
        const { error } = await supabase
          .from('agents')
          .delete()
          .eq('id', deleteAgentId);

        if (error) throw error;
      }

      toast.success("تم حذف الوكيل بنجاح");
      fetchWorkspaceAndAgents();
    } catch (error: any) {
      console.error('Error deleting agent:', error);
      toast.error(error.message || "فشل في حذف الوكيل");
    } finally {
      setIsDeleting(false);
      setDeleteAgentId(null);
    }
  };

  const resetForm = () => {
    setNewAgentName("");
    setNewAgentEmail("");
    setNewAgentPassword("");
    setNewAgentAvatarUrl("");
    setShowPassword(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الوكلاء</h1>
          <p className="text-muted-foreground mt-1">إدارة وكلاء خدمة العملاء</p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 ml-2" />
              إضافة وكيل
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة وكيل جديد</DialogTitle>
              <DialogDescription>
                أنشئ حساب وكيل جديد يمكنه الوصول إلى المحادثات المعينة له والطلبات التي ينشئها فقط
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="agent-avatar" className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  صورة الوكيل (رابط)
                </Label>
                <Input
                  id="agent-avatar"
                  value={newAgentAvatarUrl}
                  onChange={(e) => setNewAgentAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  dir="ltr"
                />
                {newAgentAvatarUrl && (
                  <div className="flex justify-center">
                    <img 
                      src={newAgentAvatarUrl} 
                      alt="معاينة" 
                      className="w-16 h-16 rounded-full object-cover border-2 border-primary/20"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="agent-name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  اسم الوكيل *
                </Label>
                <Input
                  id="agent-name"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="أدخل اسم الوكيل"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  البريد الإلكتروني *
                </Label>
                <Input
                  id="agent-email"
                  type="email"
                  value={newAgentEmail}
                  onChange={(e) => setNewAgentEmail(e.target.value)}
                  placeholder="agent@example.com"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  كلمة المرور *
                </Label>
                <div className="relative">
                  <Input
                    id="agent-password"
                    type={showPassword ? "text" : "password"}
                    value={newAgentPassword}
                    onChange={(e) => setNewAgentPassword(e.target.value)}
                    placeholder="كلمة مرور قوية (6 أحرف على الأقل)"
                    dir="ltr"
                    className="pl-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-1">صلاحيات الوكيل:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>الوصول إلى المحادثات المعينة له فقط</li>
                  <li>إنشاء طلبات جديدة</li>
                  <li>عرض الطلبات التي أنشأها فقط</li>
                  <li>لا يمكنه تعيين المحادثات</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddDialog(false);
                resetForm();
              }}>
                إلغاء
              </Button>
              <Button 
                onClick={handleAddAgent} 
                disabled={!newAgentName.trim() || !newAgentEmail.trim() || !newAgentPassword.trim() || isCreating}
              >
                {isCreating ? "جاري الإنشاء..." : "إضافة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card key={agent.id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${agent.is_ai ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-primary/10'}`}>
                  {agent.is_ai ? (
                    <img src={genieIcon} alt="المارد" className="w-8 h-8" />
                  ) : agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{agent.name}</h3>
                  {agent.email && (
                    <p className="text-xs text-muted-foreground" dir="ltr">{agent.email}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {agent.is_ai && (
                      <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">
                        <Bot className="w-3 h-3 ml-1" />
                        ذكاء اصطناعي
                      </Badge>
                    )}
                    {agent.is_system && (
                      <Badge variant="outline">النظام</Badge>
                    )}
                    {agent.is_user_agent && (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                        <UserCheck className="w-3 h-3 ml-1" />
                        وكيل مستخدم
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {!agent.is_system && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteAgentId(agent.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}

        {agents.length === 0 && (
          <Card className="p-6 col-span-full">
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">لا يوجد وكلاء بعد</p>
            </div>
          </Card>
        )}
      </div>

      {/* Delete Agent Dialog */}
      <AlertDialog open={!!deleteAgentId} onOpenChange={() => setDeleteAgentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذا الوكيل؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الوكيل وحسابه نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAgent} 
              className="bg-destructive text-destructive-foreground"
              disabled={isDeleting}
            >
              {isDeleting ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agents;
