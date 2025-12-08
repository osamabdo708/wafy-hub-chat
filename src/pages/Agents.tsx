import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Plus, Trash2, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import genieIcon from "@/assets/genie-icon.png";
import agentIcon from "@/assets/agent-icon.png";

interface Agent {
  id: string;
  name: string;
  avatar_url: string | null;
  is_ai: boolean;
  is_system: boolean;
  workspace_id: string;
  created_at: string;
}

const Agents = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
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
    if (!newAgentName.trim() || !workspaceId) return;

    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          name: newAgentName.trim(),
          workspace_id: workspaceId,
          is_ai: false,
          is_system: false
        });

      if (error) throw error;

      toast.success("تم إضافة الوكيل بنجاح");
      setNewAgentName("");
      setShowAddDialog(false);
      fetchWorkspaceAndAgents();
    } catch (error) {
      console.error('Error adding agent:', error);
      toast.error("فشل في إضافة الوكيل");
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteAgentId) return;

    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', deleteAgentId);

      if (error) throw error;

      toast.success("تم حذف الوكيل بنجاح");
      fetchWorkspaceAndAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error("فشل في حذف الوكيل");
    } finally {
      setDeleteAgentId(null);
    }
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

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 ml-2" />
              إضافة وكيل
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة وكيل جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">اسم الوكيل</Label>
                <Input
                  id="agent-name"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="أدخل اسم الوكيل"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                إلغاء
              </Button>
              <Button onClick={handleAddAgent} disabled={!newAgentName.trim()}>
                إضافة
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
                    <img src={agent.avatar_url} alt={agent.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <img src={agentIcon} alt={agent.name} className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{agent.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {agent.is_ai && (
                      <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">
                        <Bot className="w-3 h-3 ml-1" />
                        ذكاء اصطناعي
                      </Badge>
                    )}
                    {agent.is_system && (
                      <Badge variant="outline">النظام</Badge>
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
              سيتم حذف الوكيل نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAgent} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agents;
