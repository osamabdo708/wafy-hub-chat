import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  Banknote, 
  Loader2,
  Check,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentSettingsData {
  cod_enabled: boolean;
  paytabs_enabled: boolean;
  paytabs_profile_id: string;
  paytabs_server_key: string;
}

const PaymentSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PaymentSettingsData>({
    cod_enabled: true,
    paytabs_enabled: false,
    paytabs_profile_id: "",
    paytabs_server_key: "",
  });

  useEffect(() => {
    fetchPaymentSettings();
  }, []);

  const fetchPaymentSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (!workspace) return;
      setWorkspaceId(workspace.id);

      const { data: settings } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('workspace_id', workspace.id)
        .single();

      if (settings) {
        setSettingsId(settings.id);
        setFormData({
          cod_enabled: settings.cod_enabled ?? true,
          paytabs_enabled: settings.paytabs_enabled ?? false,
          paytabs_profile_id: settings.paytabs_profile_id || "",
          paytabs_server_key: "", // Don't load encrypted key
        });
      }
    } catch (error) {
      console.error('Error fetching payment settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workspaceId) return;

    if (formData.paytabs_enabled && (!formData.paytabs_profile_id || !formData.paytabs_server_key)) {
      toast.error('يرجى إدخال بيانات PayTabs لتفعيل الدفع الإلكتروني');
      return;
    }

    setSaving(true);
    try {
      const settingsData: Record<string, any> = {
        workspace_id: workspaceId,
        cod_enabled: formData.cod_enabled,
        paytabs_enabled: formData.paytabs_enabled,
        paytabs_profile_id: formData.paytabs_profile_id || null,
      };

      // Only update server key if provided
      if (formData.paytabs_server_key) {
        settingsData.paytabs_server_key_encrypted = formData.paytabs_server_key;
      }

      if (settingsId) {
        const { error } = await supabase
          .from('payment_settings')
          .update(settingsData)
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_settings')
          .insert(settingsData);

        if (error) throw error;
      }

      toast.success('تم حفظ إعدادات الدفع');
      fetchPaymentSettings();
    } catch (error) {
      console.error('Error saving payment settings:', error);
      toast.error('فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
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
      {/* Cash on Delivery */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
              <Banknote className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">الدفع عند الاستلام</h3>
                {formData.cod_enabled && (
                  <Badge className="bg-green-100 text-green-700">مفعّل</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                السماح للعملاء بالدفع نقداً عند استلام الطلب
              </p>
            </div>
          </div>
          <Switch
            checked={formData.cod_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, cod_enabled: checked })}
          />
        </div>
      </Card>

      {/* PayTabs Integration */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center">
              <CreditCard className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">PayTabs</h3>
                {formData.paytabs_enabled ? (
                  <Badge className="bg-green-100 text-green-700">مفعّل</Badge>
                ) : (
                  <Badge variant="secondary">غير مفعّل</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                قبول الدفع بالبطاقات البنكية (Visa, Mastercard, مدى)
              </p>
            </div>
          </div>
          <Switch
            checked={formData.paytabs_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, paytabs_enabled: checked })}
          />
        </div>

        {formData.paytabs_enabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">كيفية الحصول على بيانات PayTabs:</p>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-700">
                  <li>سجّل في PayTabs على <a href="https://merchant.paytabs.com" target="_blank" rel="noopener noreferrer" className="underline">merchant.paytabs.com</a></li>
                  <li>اذهب إلى Developers &gt; API Keys</li>
                  <li>انسخ Profile ID و Server Key</li>
                </ol>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paytabs_profile_id">Profile ID *</Label>
                <Input
                  id="paytabs_profile_id"
                  value={formData.paytabs_profile_id}
                  onChange={(e) => setFormData({ ...formData, paytabs_profile_id: e.target.value })}
                  placeholder="أدخل Profile ID"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paytabs_server_key">Server Key *</Label>
                <Input
                  id="paytabs_server_key"
                  type="password"
                  value={formData.paytabs_server_key}
                  onChange={(e) => setFormData({ ...formData, paytabs_server_key: e.target.value })}
                  placeholder={settingsId ? "اتركه فارغاً للاحتفاظ بالقيمة الحالية" : "أدخل Server Key"}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
              <div className="text-sm">
                <span className="font-medium">طرق الدفع المدعومة: </span>
                <span className="text-muted-foreground">Visa, Mastercard, مدى، Apple Pay</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Summary */}
      <Card className="p-6 bg-muted/30">
        <h4 className="font-semibold mb-3">ملخص طرق الدفع المفعّلة</h4>
        <div className="flex flex-wrap gap-2">
          {formData.cod_enabled && (
            <Badge variant="outline" className="gap-1">
              <Banknote className="w-3 h-3" />
              نقدي عند الاستلام
            </Badge>
          )}
          {formData.paytabs_enabled && (
            <>
              <Badge variant="outline" className="gap-1">
                <CreditCard className="w-3 h-3" />
                Visa
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CreditCard className="w-3 h-3" />
                Mastercard
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CreditCard className="w-3 h-3" />
                مدى
              </Badge>
            </>
          )}
          {!formData.cod_enabled && !formData.paytabs_enabled && (
            <span className="text-sm text-muted-foreground">لا توجد طرق دفع مفعّلة</span>
          )}
        </div>
      </Card>

      <div className="flex justify-start">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          حفظ إعدادات الدفع
        </Button>
      </div>
    </div>
  );
};

export default PaymentSettings;
