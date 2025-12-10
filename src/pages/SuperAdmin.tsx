import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Building2, Shield, Trash2, UserPlus, LogOut } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface Workspace {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  owner_email?: string;
  owner_name?: string;
}

interface UserWithWorkspace {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
}

const SuperAdmin = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<UserWithWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Use edge function to bypass RLS and get all data
      const { data, error } = await supabase.functions.invoke('super-admin-data');

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setWorkspaces(data.workspaces || []);
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("فشل في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: deleteUserId }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("تم حذف المستخدم بنجاح");
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error("فشل في حذف المستخدم");
    } finally {
      setDeleteUserId(null);
    }
  };

  const handleClearAllSessions = async () => {
    try {
      toast.loading("جاري إنهاء جميع الجلسات...");
      
      const { data, error } = await supabase.functions.invoke('clear-all-sessions');

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.dismiss();
      toast.success(`تم إنهاء ${data.clearedCount} جلسة بنجاح`);
    } catch (error) {
      console.error('Error clearing sessions:', error);
      toast.dismiss();
      toast.error("فشل في إنهاء الجلسات");
    }
  };

  const stats = [
    { label: "إجمالي المستخدمين", value: users.length, icon: Users },
    { label: "مساحات العمل", value: workspaces.length, icon: Building2 },
  ];

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
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">لوحة تحكم المشرف</h1>
            <p className="text-muted-foreground mt-1">إدارة المستخدمين ومساحات العمل</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">المستخدمين</h2>
          <Button
            variant="outline"
            onClick={handleClearAllSessions}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            إنهاء جميع الجلسات
          </Button>
        </div>

        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">الدور</TableHead>
                <TableHead className="text-right">مساحة العمل</TableHead>
                <TableHead className="text-right">تاريخ التسجيل</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' ? 'مشرف' : 'وكيل'}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.workspace_name || '-'}</TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString('ar-SA')}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteUserId(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Workspaces Table */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">مساحات العمل</h2>

        <ScrollArea className="h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم مساحة العمل</TableHead>
                <TableHead className="text-right">المالك</TableHead>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell className="font-medium">{workspace.name}</TableCell>
                  <TableCell>{workspace.owner_name}</TableCell>
                  <TableCell>{workspace.owner_email}</TableCell>
                  <TableCell>
                    {new Date(workspace.created_at).toLocaleDateString('ar-SA')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذا المستخدم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المستخدم ومساحة العمل الخاصة به نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdmin;
