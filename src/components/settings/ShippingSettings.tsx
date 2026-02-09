import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Truck, 
  Edit, 
  Trash2, 
  Loader2,
  Package
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ShippingMethod {
  id: string;
  name: string;
  description?: string | null;
  provider: string;
  price: number;
  estimated_days?: number | null;
  is_active: boolean;
  config?: any;
}

const ShippingSettings = () => {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<ShippingMethod | null>(null);
  const [deletingMethod, setDeletingMethod] = useState<ShippingMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    provider: "manual",
    price: "",
    estimated_days: "",
    is_active: true,
    eps_api_key: "",
    eps_account_id: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (workspace) {
        setWorkspaceId(workspace.id);
      }

      fetchMethods();
    };
    init();
  }, []);

  const fetchMethods = async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_methods')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMethods(data || []);
    } catch (error) {
      console.error('Error fetching shipping methods:', error);
      toast.error('فشل تحميل طرق الشحن');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (method?: ShippingMethod) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        description: method.description || "",
        provider: method.provider,
        price: method.price.toString(),
        estimated_days: method.estimated_days?.toString() || "",
        is_active: method.is_active,
        eps_api_key: method.config?.eps_api_key || "",
        eps_account_id: method.config?.eps_account_id || "",
      });
    } else {
      setEditingMethod(null);
      setFormData({
        name: "",
        description: "",
        provider: "manual",
        price: "",
        estimated_days: "",
        is_active: true,
        eps_api_key: "",
        eps_account_id: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSaveMethod = async () => {
    if (!formData.name.trim()) {
      toast.error('اسم طريقة الشحن مطلوب');
      return;
    }

    if (!formData.price) {
      toast.error('سعر الشحن مطلوب');
      return;
    }

    setSaving(true);
    try {
      const config: Record<string, any> = {};
      if (formData.provider === 'eps') {
        config.eps_api_key = formData.eps_api_key;
        config.eps_account_id = formData.eps_account_id;
      }

      const methodData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        provider: formData.provider,
        price: parseFloat(formData.price),
        estimated_days: formData.estimated_days ? parseInt(formData.estimated_days) : null,
        is_active: formData.is_active,
        config: Object.keys(config).length > 0 ? config : null,
      };

      if (editingMethod) {
        const { error } = await supabase
          .from('shipping_methods')
          .update(methodData)
          .eq('id', editingMethod.id);

        if (error) throw error;
        toast.success('تم تحديث طريقة الشحن بنجاح');
      } else {
        if (!workspaceId) {
          toast.error('فشل في تحديد مساحة العمل');
          return;
        }

        const { error } = await supabase
          .from('shipping_methods')
          .insert({ ...methodData, workspace_id: workspaceId });

        if (error) throw error;
        toast.success('تم إضافة طريقة الشحن بنجاح');
      }

      setDialogOpen(false);
      fetchMethods();
    } catch (error) {
      console.error('Error saving shipping method:', error);
      toast.error('فشل حفظ طريقة الشحن');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMethod = async () => {
    if (!deletingMethod) return;

    try {
      const { error } = await supabase
        .from('shipping_methods')
        .delete()
        .eq('id', deletingMethod.id);

      if (error) throw error;
      toast.success('تم حذف طريقة الشحن بنجاح');
      setDeleteDialogOpen(false);
      setDeletingMethod(null);
      fetchMethods();
    } catch (error) {
      console.error('Error deleting shipping method:', error);
      toast.error('فشل حذف طريقة الشحن');
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'eps': return 'EPS';
      case 'manual': return 'يدوي';
      default: return provider;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* EPS Integration Card */}
      <Card className="p-6 border-2 border-dashed">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Package className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold">ربط مع EPS</h3>
            <p className="text-sm text-muted-foreground">
              اربط متجرك مع شركة EPS للشحن لتفعيل الشحن التلقائي
            </p>
          </div>
          <Button onClick={() => {
            setFormData({ ...formData, provider: 'eps', name: 'شحن EPS' });
            setEditingMethod(null);
            setDialogOpen(true);
          }}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة EPS
          </Button>
        </div>
      </Card>

      {/* Shipping Methods List */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">طرق الشحن</h3>
        <Button variant="outline" onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 ml-2" />
          إضافة طريقة شحن
        </Button>
      </div>

      {methods.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">لا توجد طرق شحن</h3>
            <p className="text-muted-foreground mb-4">أضف طرق الشحن المتاحة لعملائك</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة طريقة شحن
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {methods.map((method) => (
            <Card key={method.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  method.provider === 'eps' 
                    ? 'bg-blue-100' 
                    : 'bg-muted'
                }`}>
                  <Truck className={`w-6 h-6 ${
                    method.provider === 'eps' 
                      ? 'text-blue-600' 
                      : 'text-muted-foreground'
                  }`} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{method.name}</h4>
                    <Badge variant="outline">{getProviderLabel(method.provider)}</Badge>
                    {!method.is_active && (
                      <Badge variant="secondary">معطل</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>{method.price} ₪</span>
                    {method.estimated_days && (
                      <span>{method.estimated_days} أيام</span>
                    )}
                    {method.description && (
                      <span className="line-clamp-1">{method.description}</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handleOpenDialog(method)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeletingMethod(method);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingMethod ? "تعديل طريقة الشحن" : "إضافة طريقة شحن"}
            </DialogTitle>
            <DialogDescription>
              أدخل معلومات طريقة الشحن
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="provider">المزود</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) => setFormData({ ...formData, provider: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المزود" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">يدوي</SelectItem>
                  <SelectItem value="eps">EPS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">اسم طريقة الشحن *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: توصيل سريع"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف طريقة الشحن"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">سعر الشحن (₪) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimated_days">مدة التوصيل (أيام)</Label>
                <Input
                  id="estimated_days"
                  type="number"
                  value={formData.estimated_days}
                  onChange={(e) => setFormData({ ...formData, estimated_days: e.target.value })}
                  placeholder="3"
                />
              </div>
            </div>

            {formData.provider === 'eps' && (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3">إعدادات EPS</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="eps_account_id">رقم الحساب</Label>
                    <Input
                      id="eps_account_id"
                      value={formData.eps_account_id}
                      onChange={(e) => setFormData({ ...formData, eps_account_id: e.target.value })}
                      placeholder="رقم حساب EPS"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eps_api_key">مفتاح API</Label>
                    <Input
                      id="eps_api_key"
                      type="password"
                      value={formData.eps_api_key}
                      onChange={(e) => setFormData({ ...formData, eps_api_key: e.target.value })}
                      placeholder="مفتاح API الخاص بـ EPS"
                    />
                  </div>
                </div>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <div>
                <Label>نشط</Label>
                <p className="text-sm text-muted-foreground">
                  إتاحة طريقة الشحن للعملاء
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSaveMethod} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              {editingMethod ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف طريقة الشحن "{deletingMethod?.name}" نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMethod}
              className="bg-destructive hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShippingSettings;
