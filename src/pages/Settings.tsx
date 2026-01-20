import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Store, ExternalLink, CheckCircle2 } from "lucide-react";
import { ChannelCard } from "@/components/ChannelCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import agentIcon from "@/assets/agent-icon.png";
import { 
  WhatsAppIcon, 
  MessengerIcon, 
  InstagramIcon, 
  TelegramIcon 
} from "@/components/ChannelIcons";

const Settings = () => {
  const { toast } = useToast();
  const [defaultAiEnabled, setDefaultAiEnabled] = useState(false);
  const [loadingAiSetting, setLoadingAiSetting] = useState(true);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState<string | null>(null);
  const [shopifyShopName, setShopifyShopName] = useState<string | null>(null);

  // Load the default AI setting and Shopify status from workspace settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id, settings')
          .eq('owner_user_id', user.id)
          .limit(1)
          .single();

        if (workspace?.settings) {
          const settings = workspace.settings as { default_ai_enabled?: boolean };
          setDefaultAiEnabled(settings.default_ai_enabled || false);
        }

        // Load Shopify settings
        if (workspace) {
          const { data: shopifySettings } = await supabase
            .from('shopify_settings')
            .select('is_connected, store_url, shop_name')
            .eq('workspace_id', workspace.id)
            .limit(1)
            .single();

          if (shopifySettings) {
            setShopifyConnected(shopifySettings.is_connected || false);
            setShopifyStoreUrl(shopifySettings.store_url);
            setShopifyShopName(shopifySettings.shop_name);
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoadingAiSetting(false);
      }
    };

    loadSettings();
  }, []);

  const handleToggleDefaultAi = async (enabled: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id, settings')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      const currentSettings = (workspace.settings as Record<string, unknown>) || {};
      const newSettings = { ...currentSettings, default_ai_enabled: enabled };

      const { error } = await supabase
        .from('workspaces')
        .update({ settings: newSettings })
        .eq('id', workspace.id);

      if (error) throw error;

      setDefaultAiEnabled(enabled);
      toast({
        title: enabled ? "تم تفعيل المارد" : "تم تعطيل المارد",
        description: enabled 
          ? "سيتم تفعيل المارد تلقائياً للمحادثات الجديدة فقط" 
          : "لن يتم تفعيل المارد تلقائياً للمحادثات الجديدة",
      });
    } catch (error) {
      console.error('Error updating AI setting:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحديث الإعداد",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <LayoutDashboard className="w-8 h-8" />
          لوحة التحكم
        </h1>
        <p className="text-muted-foreground mt-1">إدارة القنوات وإعدادات المارد الذكي</p>
      </div>

      {/* AI Auto-Enable Card */}
{/* AI Auto-Enable Card */}
<Card className="p-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
        <img src={agentIcon} alt="المارد" className="w-9 h-9" />
      </div>
      <div>
        <Label className="text-lg font-bold">تفعيل المارد تلقائياً</Label>
        <p className="text-sm text-muted-foreground mt-1">
          تفعيل المارد لجميع المحادثات الجديدة بشكل افتراضي
        </p>
      </div>
    </div>

    <Switch
      checked={defaultAiEnabled}
      onCheckedChange={handleToggleDefaultAi}
      disabled={loadingAiSetting}
      className="
        scale-125
        data-[state=checked]:bg-gradient-to-r
        data-[state=checked]:from-purple-500
        data-[state=checked]:to-blue-500
      "
    />
  </div>
</Card>


      {/* Shopify Connection Card */}
      {shopifyConnected && (
        <Card className="p-6 border-2 border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#96bf48] flex items-center justify-center shadow-lg">
                <Store className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-lg font-bold">Shopify</Label>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {shopifyShopName ? `متصل بـ ${shopifyShopName}` : 'متصل بمتجر Shopify'}
                </p>
              </div>
            </div>
            {shopifyStoreUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://${shopifyStoreUrl.replace(/^https?:\/\//, '')}`, '_blank')}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                زيارة المتجر
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Channels Section */}
      <div>
        <h3 className="text-lg font-bold mb-2">قنوات التواصل</h3>
        <p className="text-muted-foreground text-sm mb-4">حالة القنوات المتصلة - يتم إدارتها من قبل المشرف</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <ChannelCard
          channel="whatsapp"
          name="واتساب"
          iconComponent={<WhatsAppIcon className="h-8 w-8" />}
          bgColor="bg-muted"
        />
        <ChannelCard
          channel="facebook"
          name="فيسبوك"
          iconComponent={<MessengerIcon className="h-8 w-8" />}
          bgColor="bg-muted"
        />
        <ChannelCard
          channel="instagram"
          name="إنستغرام"
          iconComponent={<InstagramIcon className="h-8 w-8" />}
          bgColor="bg-muted"
        />
        <ChannelCard
          channel="telegram"
          name="تليجرام"
          iconComponent={<TelegramIcon className="h-8 w-8" />}
          bgColor="bg-muted"
        />
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border">
        <p className="text-sm text-muted-foreground text-center">
          💡 يتم إدارة ربط القنوات من قبل المشرف العام في لوحة التحكم
        </p>
      </div>
    </div>
  );
};

export default Settings;
