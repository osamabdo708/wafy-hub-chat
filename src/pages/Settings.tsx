import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LayoutDashboard, Mail } from "lucide-react";
import { ChannelCard } from "@/components/ChannelCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import agentIcon from "@/assets/agent-icon.png";
import { 
  WhatsAppIcon, 
  MessengerIcon, 
  InstagramIcon, 
  TikTokChannelIcon, 
  TelegramIcon 
} from "@/components/ChannelIcons";

const Settings = () => {
  const { toast } = useToast();
  const [defaultAiEnabled, setDefaultAiEnabled] = useState(false);
  const [loadingAiSetting, setLoadingAiSetting] = useState(true);

  // Load the default AI setting from workspace settings
  useEffect(() => {
    const loadAiSetting = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('owner_user_id', user.id)
          .limit(1)
          .single();

        if (workspace?.settings) {
          const settings = workspace.settings as { default_ai_enabled?: boolean };
          setDefaultAiEnabled(settings.default_ai_enabled || false);
        }
      } catch (error) {
        console.error('Error loading AI setting:', error);
      } finally {
        setLoadingAiSetting(false);
      }
    };

    loadAiSetting();
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
            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-blue-500 scale-125"
          />
        </div>
      </Card>

      {/* Channels Section */}
      <div>
        <h3 className="text-lg font-bold mb-2">قنوات التواصل</h3>
        <p className="text-muted-foreground text-sm mb-4">حالة القنوات المتصلة - يتم إدارتها من قبل المشرف</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          channel="tiktok"
          name="تيك توك"
          iconComponent={<TikTokChannelIcon className="h-8 w-8" />}
          bgColor="bg-muted"
          comingSoon
        />
        <ChannelCard
          channel="telegram"
          name="تليجرام"
          iconComponent={<TelegramIcon className="h-8 w-8" />}
          bgColor="bg-muted"
          comingSoon
        />
        <ChannelCard
          channel="email"
          name="البريد"
          iconComponent={<Mail className="h-8 w-8 text-muted-foreground" />}
          bgColor="bg-muted"
          comingSoon
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
