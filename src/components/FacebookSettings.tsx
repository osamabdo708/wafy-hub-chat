import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const FacebookSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState({
    page_access_token: "",
    page_id: "",
    app_secret: "",
    verify_token: "omnichat_facebook_verify_2024"
  });

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'facebook')
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
          channel: 'facebook',
          config: config,
          is_connected: false // Don't mark as connected until test succeeds
        }, {
          onConflict: 'channel'
        });

      if (error) throw error;

      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات فيسبوك بنجاح. اضغط 'اختبار الاتصال' للتفعيل",
      });
    } catch (error) {
      console.error('Error saving Facebook config:', error);
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
      // Test using the /conversations endpoint like the Python code does
      const response = await fetch(
        `https://graph.facebook.com/v17.0/${config.page_id}/conversations?fields=id,participants,updated_time&limit=1&access_token=${config.page_access_token}`
      );

      if (response.ok) {
        const data = await response.json();
        
        // Mark as connected on success
        await supabase
          .from('channel_integrations')
          .upsert({
            channel: 'facebook',
            config: config,
            is_connected: true
          }, { onConflict: 'channel' });
        
        toast({
          title: "الاتصال ناجح",
          description: "تم الاتصال بفيسبوك بنجاح وتم تفعيل الاستيراد",
        });
      } else {
        const errorData = await response.json();
        console.error('Facebook API error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to connect');
      }
    } catch (error) {
      console.error('Error testing Facebook connection:', error);
      
      // Mark as disconnected on failure
      await supabase
        .from('channel_integrations')
        .upsert({
          channel: 'facebook',
          config: config,
          is_connected: false
        }, { onConflict: 'channel' });
      
      toast({
        title: "فشل الاتصال",
        description: error instanceof Error ? error.message : "تحقق من البيانات وحاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${supabaseProjectId}.supabase.co/functions/v1/facebook-webhook`;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold mb-2">إعدادات فيسبوك مسنجر</h3>
          <p className="text-sm text-muted-foreground">
            قم بإعداد تكامل فيسبوك مسنجر
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="page-token">Page Access Token</Label>
            <Input
              id="page-token"
              type="text"
              placeholder="EAAxxxxxxxxxx"
              value={config.page_access_token}
              onChange={(e) => setConfig({ ...config, page_access_token: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              احصل عليه من Meta Developers → App → Messenger → Settings
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="page-id">Page ID</Label>
            <Input
              id="page-id"
              placeholder="123456789012345"
              value={config.page_id}
              onChange={(e) => setConfig({ ...config, page_id: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-secret">App Secret</Label>
            <Input
              id="app-secret"
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxx"
              value={config.app_secret}
              onChange={(e) => setConfig({ ...config, app_secret: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-xs break-all">{webhookUrl}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              استخدم هذا الرابط في إعدادات Webhook في Meta Developers
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
          <Button onClick={handleTest} disabled={testing || !config.page_access_token} variant="outline">
            {testing && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            اختبار الاتصال
          </Button>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">خطوات التفعيل:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>انتقل إلى Meta Developers Console</li>
            <li>اختر App الخاص بك → Messenger → Settings</li>
            <li>انسخ Page Access Token و Page ID</li>
            <li>قم بإعداد Webhook باستخدام الرابط أعلاه</li>
            <li>اشترك في أحداث "messages" و "messaging_postbacks"</li>
            <li>احفظ الإعدادات واختبر الاتصال</li>
          </ol>
        </div>
      </div>
    </Card>
  );
};
