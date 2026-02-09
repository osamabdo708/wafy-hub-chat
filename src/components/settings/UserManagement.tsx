import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Users, Crown, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
  full_name?: string;
}

const UserManagement = () => {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { getWorkspaceIdForUser } = await import("@/hooks/useWorkspace");
      const wsId = await getWorkspaceIdForUser(user.id);
      if (!wsId) return;

      setWorkspaceId(wsId);

      // Check if current user is the owner
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('owner_user_id')
        .eq('id', wsId)
        .single();

      setIsOwner(workspace?.owner_user_id === user.id);

      // Fetch members
      const { data: membersData, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for each member
      if (membersData) {
        const userIds = membersData.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        const enriched = membersData.map(m => {
          const profile = profiles?.find(p => p.id === m.user_id);
          return {
            ...m,
            email: profile?.email || '',
            full_name: profile?.full_name || '',
          };
        });

        setMembers(enriched);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserPassword || !newUserName) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setAddingUser(true);
    try {
      // Call edge function to create user and add to workspace
      const { data, error } = await supabase.functions.invoke('add-workspace-user', {
        body: {
          workspace_id: workspaceId,
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserName,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("تم إضافة المستخدم بنجاح");
      setShowAddDialog(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      fetchMembers();
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error(error instanceof Error ? error.message : "فشل في إضافة المستخدم");
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (memberId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast.success("تم إزالة المستخدم بنجاح");
      setRemovingUserId(null);
      fetchMembers();
    } catch (error) {
      console.error('Error removing user:', error);
      toast.error("فشل في إزالة المستخدم");
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">مستخدمو النظام</h3>
              <p className="text-sm text-muted-foreground">إدارة المستخدمين الذين يمكنهم الوصول للنظام</p>
            </div>
          </div>
          {isOwner && (
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              إضافة مستخدم
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {(member.full_name || member.email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{member.full_name || 'بدون اسم'}</span>
                    {member.role === 'owner' && (
                      <Badge variant="default" className="gap-1 text-xs">
                        <Crown className="w-3 h-3" />
                        المالك
                      </Badge>
                    )}
                    {member.role === 'member' && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Shield className="w-3 h-3" />
                        مستخدم
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground" dir="ltr">{member.email}</span>
                </div>
              </div>

              {isOwner && member.role !== 'owner' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setRemovingUserId(member.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="أدخل الاسم الكامل"
              />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addingUser}>
              إلغاء
            </Button>
            <Button onClick={handleAddUser} disabled={addingUser}>
              {addingUser ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirmation */}
      <AlertDialog open={!!removingUserId} onOpenChange={() => setRemovingUserId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إزالة هذا المستخدم من النظام ولن يتمكن من تسجيل الدخول بعد الآن.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const member = members.find(m => m.id === removingUserId);
                if (member) handleRemoveUser(member.id, member.user_id);
              }}
            >
              إزالة المستخدم
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
