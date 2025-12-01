import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export const WhatsAppSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState({
    access_token: "",
    phone_number_id: "",
    business_account_id: "",
    verify_token: "omnichat_webhook_verify_2024"
  });

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'whatsapp')
        .single();

      if (data?.config) {
        setConfig(data.config as typeof config);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('channel_integrations')
        .upsert({
          channel: 'whatsapp',
          config: config,
          is_connected: false // Don't mark as connected until test succeeds
        }, {
          onConflict: 'channel'
        });

      if (error) throw error;

      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات واتساب بنجاح. اضغط 'اختبار الاتصال' للتفعيل",
      });
    } catch (error) {
      console.error('Error saving WhatsApp config:', error);
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // Test the connection by calling WhatsApp API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${config.phone_number_id}`,
        {
          headers: {
            'Authorization': `Bearer ${config.access_token}`
          }
        }
      );

      if (response.ok) {
        // Mark as connected on success
        await supabase
          .from('channel_integrations')
          .upsert({
            channel: 'whatsapp',
            config: config,
            is_connected: true
          }, { onConflict: 'channel' });
        
        toast({
          title: "الاتصال ناجح",
          description: "تم الاتصال بواتساب بنجاح وتم تفعيل الاستيراد",
        });
      } else {
        throw new Error('Failed to connect');
      }
    } catch (error) {
      console.error('Error testing WhatsApp connection:', error);
      
      // Mark as disconnected on failure
      await supabase
        .from('channel_integrations')
        .upsert({
          channel: 'whatsapp',
          config: config,
          is_connected: false
        }, { onConflict: 'channel' });
      
      toast({
        title: "فشل الاتصال",
        description: "تحقق من البيانات وحاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = `${window.location.origin.replace('http://', 'https://')}/whatsapp-webhook`;
  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const actualWebhookUrl = `https://${supabaseProjectId}.supabase.co/functions/v1/whatsapp-webhook`;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold mb-2">إعدادات واتساب بيزنس</h3>
          <p className="text-sm text-muted-foreground">
            قم بإعداد تكامل واتساب بيزنس Cloud API
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="access-token">Access Token</Label>
            <Input
              id="access-token"
              type="text"
              placeholder="EAAxxxxxxxxxx"
              value={config.access_token}
              onChange={(e) => setConfig({ ...config, access_token: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              احصل عليه من Meta Business Suite → WhatsApp → API Setup
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone-id">Phone Number ID</Label>
            <Input
              id="phone-id"
              placeholder="123456789012345"
              value={config.phone_number_id}
              onChange={(e) => setConfig({ ...config, phone_number_id: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-id">Business Account ID</Label>
            <Input
              id="business-id"
              placeholder="123456789012345"
              value={config.business_account_id}
              onChange={(e) => setConfig({ ...config, business_account_id: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-xs break-all">{actualWebhookUrl}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              استخدم هذا الرابط في إعدادات Webhook في Meta
            </p>
          </div>

          <div className="space-y-2">
            <Label>Verify Token</Label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-xs">{config.verify_token}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              استخدم هذا Token عند تفعيل Webhook
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            حفظ الإعدادات
          </Button>
          <Button onClick={handleTest} disabled={testing || !config.access_token} variant="outline">
            {testing && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            اختبار الاتصال
          </Button>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">خطوات التفعيل:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>انتقل إلى Meta Business Suite</li>
            <li>اختر WhatsApp → API Setup</li>
            <li>انسخ Access Token و Phone Number ID</li>
            <li>قم بإعداد Webhook باستخدام الرابط أعلاه</li>
            <li>اشترك في حدث "messages"</li>
            <li>احفظ الإعدادات واختبر الاتصال</li>
          </ol>
        </div>
      </div>
    </Card>
  );
};
