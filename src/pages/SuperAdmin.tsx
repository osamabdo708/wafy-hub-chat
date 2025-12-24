import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, 
  Building2, 
  Shield, 
  Trash2, 
  LogOut, 
  Settings, 
  Eye, 
  EyeOff,
  Save,
  RefreshCw,
  Globe,
  CreditCard,
  Truck,
  Bot,
  Facebook
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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

interface AppSetting {
  id: string;
  key: string;
  value: string;
  display_value: string;
  description: string;
  category: string;
  is_sensitive: boolean;
  updated_at: string;
}

const SuperAdmin = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<UserWithWorkspace[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
    fetchSettings();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-data');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWorkspaces(data.workspaces || []);
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("فشل في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-app-settings', {
        body: { action: 'get' }
      });
      if (error) throw error;
      setSettings(data.settings || []);
      
      // Initialize edited settings with current values
      const initial: Record<string, string> = {};
      data.settings?.forEach((s: AppSetting) => {
        initial[s.key] = s.is_sensitive ? '' : s.value;
      });
      setEditedSettings(initial);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSaveSettings = async (category: string) => {
    setSavingSettings(true);
    try {
      const categorySettings = settings.filter(s => s.category === category);
      const updates: Record<string, string> = {};
      
      categorySettings.forEach(s => {
        const newValue = editedSettings[s.key];
        if (newValue && newValue !== s.value && !newValue.startsWith('••••')) {
          updates[s.key] = newValue;
        }
      });

      if (Object.keys(updates).length === 0) {
        toast.info("لا توجد تغييرات لحفظها");
        setSavingSettings(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-app-settings', {
        body: { action: 'update', settings: updates }
      });

      if (error) throw error;

      toast.success("تم حفظ الإعدادات بنجاح");
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error("فشل في حفظ الإعدادات");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: deleteUserId }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
      if (data?.error) throw new Error(data.error);
      toast.dismiss();
      toast.success(`تم إنهاء ${data.clearedCount} جلسة بنجاح`);
    } catch (error) {
      console.error('Error clearing sessions:', error);
      toast.dismiss();
      toast.error("فشل في إنهاء الجلسات");
    }
  };

  const toggleSensitive = (key: string) => {
    setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getSettingsByCategory = (category: string) => 
    settings.filter(s => s.category === category);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'meta': return <Facebook className="w-5 h-5" />;
      case 'ai': return <Bot className="w-5 h-5" />;
      case 'payments': return <CreditCard className="w-5 h-5" />;
      case 'shipping': return <Truck className="w-5 h-5" />;
      default: return <Settings className="w-5 h-5" />;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'meta': return 'إعدادات Meta (Facebook/Instagram/WhatsApp)';
      case 'ai': return 'إعدادات الذكاء الاصطناعي';
      case 'payments': return 'إعدادات الدفع';
      case 'shipping': return 'إعدادات الشحن';
      default: return 'إعدادات عامة';
    }
  };

  const renderSettingsSection = (category: string) => {
    const categorySettings = getSettingsByCategory(category);
    
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {getCategoryIcon(category)}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{getCategoryTitle(category)}</h3>
              <p className="text-sm text-muted-foreground">
                {category === 'meta' && 'إعدادات تطبيق Meta للربط مع المنصات الاجتماعية'}
                {category === 'ai' && 'إعدادات مفاتيح API للذكاء الاصطناعي'}
                {category === 'payments' && 'إعدادات بوابات الدفع الإلكتروني'}
                {category === 'shipping' && 'إعدادات شركات الشحن'}
              </p>
            </div>
          </div>
          <Button 
            onClick={() => handleSaveSettings(category)}
            disabled={savingSettings}
            className="gap-2"
          >
            {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التغييرات
          </Button>
        </div>
        
        <Separator className="mb-6" />
        
        <div className="space-y-4">
          {categorySettings.map((setting) => (
            <div key={setting.id} className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={setting.key} className="text-sm font-medium">
                  {setting.description}
                </Label>
                {setting.is_sensitive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSensitive(setting.key)}
                    className="h-8 px-2"
                  >
                    {showSensitive[setting.key] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id={setting.key}
                  type={setting.is_sensitive && !showSensitive[setting.key] ? 'password' : 'text'}
                  placeholder={setting.display_value || `أدخل ${setting.description}`}
                  value={editedSettings[setting.key] || ''}
                  onChange={(e) => setEditedSettings(prev => ({
                    ...prev,
                    [setting.key]: e.target.value
                  }))}
                  className="font-mono text-sm"
                  dir="ltr"
                />
              </div>
              {setting.value && (
                <p className="text-xs text-muted-foreground">
                  القيمة الحالية: {setting.is_sensitive ? setting.display_value : setting.value}
                  {setting.updated_at && (
                    <span className="mr-2">
                      (آخر تحديث: {new Date(setting.updated_at).toLocaleDateString('ar-SA')})
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    );
  };

  const stats = [
    { label: "إجمالي المستخدمين", value: users.length, icon: Users, color: "bg-blue-500/10 text-blue-500" },
    { label: "مساحات العمل", value: workspaces.length, icon: Building2, color: "bg-green-500/10 text-green-500" },
    { label: "الإعدادات النشطة", value: settings.filter(s => s.value).length, icon: Settings, color: "bg-purple-500/10 text-purple-500" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              لوحة تحكم المشرف العام
            </h1>
            <p className="text-muted-foreground mt-1">إدارة النظام والمستخدمين والإعدادات</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleClearAllSessions}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          إنهاء جميع الجلسات
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            المستخدمين
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="gap-2">
            <Building2 className="w-4 h-4" />
            مساحات العمل
          </TabsTrigger>
          <TabsTrigger value="meta" className="gap-2">
            <Facebook className="w-4 h-4" />
            Meta
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="w-4 h-4" />
            التكاملات
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Settings className="w-4 h-4" />
            النظام
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">إدارة المستخدمين</h2>
              <Badge variant="secondary">{users.length} مستخدم</Badge>
            </div>

            <ScrollArea className="h-[500px]">
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
                    <TableRow key={user.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{user.email}</TableCell>
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
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
        </TabsContent>

        {/* Workspaces Tab */}
        <TabsContent value="workspaces">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">مساحات العمل</h2>
              <Badge variant="secondary">{workspaces.length} مساحة</Badge>
            </div>

            <ScrollArea className="h-[500px]">
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
                    <TableRow key={workspace.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{workspace.name}</TableCell>
                      <TableCell>{workspace.owner_name || '-'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{workspace.owner_email}</TableCell>
                      <TableCell>
                        {new Date(workspace.created_at).toLocaleDateString('ar-SA')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* Meta Settings Tab */}
        <TabsContent value="meta" className="space-y-6">
          {renderSettingsSection('meta')}
          
          <Card className="p-6 border-dashed">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              روابط Webhook
            </h4>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted">
                <Label className="text-sm font-medium">Facebook Webhook URL</Label>
                <p className="text-sm font-mono mt-1 text-muted-foreground" dir="ltr">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-webhook`}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <Label className="text-sm font-medium">Instagram Webhook URL</Label>
                <p className="text-sm font-mono mt-1 text-muted-foreground" dir="ltr">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <Label className="text-sm font-medium">WhatsApp Webhook URL</Label>
                <p className="text-sm font-mono mt-1 text-muted-foreground" dir="ltr">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          {renderSettingsSection('payments')}
          {renderSettingsSection('shipping')}
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          {renderSettingsSection('ai')}
          
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">معلومات النظام</h3>
            <div className="grid gap-4">
              <div className="flex justify-between p-3 rounded-lg bg-muted">
                <span className="text-muted-foreground">معرف المشروع</span>
                <span className="font-mono text-sm" dir="ltr">{import.meta.env.VITE_SUPABASE_PROJECT_ID}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted">
                <span className="text-muted-foreground">إصدار API</span>
                <span className="font-mono text-sm">v1.0.0</span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

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
