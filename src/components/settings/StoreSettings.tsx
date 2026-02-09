import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Store, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StoreSettingsData {
  store_slug: string;
  store_logo_url: string;
  store_banner_url: string;
  store_description: string;
  store_phone: string;
  store_email: string;
  store_address: string;
  store_enabled: boolean;
}

const StoreSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<StoreSettingsData>({
    store_slug: "",
    store_logo_url: "",
    store_banner_url: "",
    store_description: "",
    store_phone: "",
    store_email: "",
    store_address: "",
    store_enabled: false,
  });

  useEffect(() => {
    fetchStoreSettings();
  }, []);

  const fetchStoreSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (error) throw error;
      
      if (workspace) {
        setWorkspaceId(workspace.id);
        setFormData({
          store_slug: (workspace as any).store_slug || "",
          store_logo_url: (workspace as any).store_logo_url || "",
          store_banner_url: (workspace as any).store_banner_url || "",
          store_description: (workspace as any).store_description || "",
          store_phone: (workspace as any).store_phone || "",
          store_email: (workspace as any).store_email || "",
          store_address: (workspace as any).store_address || "",
          store_enabled: (workspace as any).store_enabled || false,
        });
      }
    } catch (error) {
      console.error('Error fetching store settings:', error);
      toast.error('فشل تحميل إعدادات المتجر');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workspaceId) return;

    // Validate slug
    if (formData.store_enabled && !formData.store_slug.trim()) {
      toast.error('رابط المتجر مطلوب لتفعيل المتجر');
      return;
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (formData.store_slug && !slugRegex.test(formData.store_slug)) {
      toast.error('رابط المتجر يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({
          store_slug: formData.store_slug.trim() || null,
          store_logo_url: formData.store_logo_url.trim() || null,
          store_banner_url: formData.store_banner_url.trim() || null,
          store_description: formData.store_description.trim() || null,
          store_phone: formData.store_phone.trim() || null,
          store_email: formData.store_email.trim() || null,
          store_address: formData.store_address.trim() || null,
          store_enabled: formData.store_enabled,
        })
        .eq('id', workspaceId);

      if (error) {
        if (error.code === '23505') {
          toast.error('رابط المتجر مستخدم بالفعل، اختر رابطاً آخر');
          return;
        }
        throw error;
      }

      toast.success('تم حفظ إعدادات المتجر');
    } catch (error) {
      console.error('Error saving store settings:', error);
      toast.error('فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const storeUrl = formData.store_slug ? `${window.location.origin}/store/${formData.store_slug}` : '';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Store className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">تفعيل المتجر</h3>
              <p className="text-sm text-muted-foreground">
                فعّل متجرك الإلكتروني ليصبح متاحاً للعملاء
              </p>
            </div>
          </div>
          <Switch
            checked={formData.store_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, store_enabled: checked })}
          />
        </div>

        {formData.store_enabled && storeUrl && (
          <div className="bg-success/10 border border-success/20 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-success">متجرك مفعّل!</p>
              <p className="text-sm text-muted-foreground">{storeUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 ml-1" />
                  معاينة
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(storeUrl)}>
                <ExternalLink className="w-4 h-4 ml-1" />
                نسخ الرابط
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">معلومات المتجر</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store_slug">رابط المتجر *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{window.location.origin}/store/</span>
              <Input
                id="store_slug"
                value={formData.store_slug}
                onChange={(e) => setFormData({ ...formData, store_slug: e.target.value.toLowerCase() })}
                placeholder="my-store"
                className="flex-1"
                dir="ltr"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              استخدم أحرف إنجليزية صغيرة وأرقام وشرطات فقط
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store_description">وصف المتجر</Label>
            <Textarea
              id="store_description"
              value={formData.store_description}
              onChange={(e) => setFormData({ ...formData, store_description: e.target.value })}
              placeholder="وصف قصير عن متجرك ومنتجاتك"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="store_logo_url">رابط الشعار</Label>
              <Input
                id="store_logo_url"
                value={formData.store_logo_url}
                onChange={(e) => setFormData({ ...formData, store_logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_banner_url">رابط البانر</Label>
              <Input
                id="store_banner_url"
                value={formData.store_banner_url}
                onChange={(e) => setFormData({ ...formData, store_banner_url: e.target.value })}
                placeholder="https://example.com/banner.jpg"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">معلومات الاتصال</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="store_phone">رقم الهاتف</Label>
              <Input
                id="store_phone"
                value={formData.store_phone}
                onChange={(e) => setFormData({ ...formData, store_phone: e.target.value })}
                placeholder="+966 5XX XXX XXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_email">البريد الإلكتروني</Label>
              <Input
                id="store_email"
                type="email"
                value={formData.store_email}
                onChange={(e) => setFormData({ ...formData, store_email: e.target.value })}
                placeholder="store@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store_address">العنوان</Label>
            <Textarea
              id="store_address"
              value={formData.store_address}
              onChange={(e) => setFormData({ ...formData, store_address: e.target.value })}
              placeholder="عنوان المتجر الفعلي"
              rows={2}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-start">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          حفظ إعدادات المتجر
        </Button>
      </div>
    </div>
  );
};

export default StoreSettings;
