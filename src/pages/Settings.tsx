import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Link, Building, Mail } from "lucide-react";
import { ChannelCard } from "@/components/ChannelCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import genieIcon from "@/assets/genie-icon.png";
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
          ? "سيتم تفعيل المارد تلقائياً لجميع المحادثات الجديدة" 
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
        <h1 className="text-3xl font-bold">الإعدادات</h1>
        <p className="text-muted-foreground mt-1">إدارة إعدادات المنصة والتكاملات</p>
      </div>

      <Tabs defaultValue="channels" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="channels">
            <Link className="w-4 h-4 ml-2" />
            القنوات
          </TabsTrigger>
          <TabsTrigger value="business">
            <Building className="w-4 h-4 ml-2" />
            العمل
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="w-4 h-4 ml-2" />
            عام
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-2">قنوات التواصل</h3>
            <p className="text-muted-foreground text-sm mb-6">اربط حساباتك لاستقبال الرسائل في صندوق وارد موحد</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <ChannelCard
              channel="whatsapp"
              name="واتساب"
              iconComponent={<WhatsAppIcon className="h-8 w-8" />}
              bgColor="bg-green-500"
              buttonColor="bg-green-600 hover:bg-green-700"
            />
            <ChannelCard
              channel="facebook"
              name="فيسبوك"
              iconComponent={<MessengerIcon className="h-8 w-8" />}
              bgColor="bg-blue-600"
              buttonColor="bg-blue-600 hover:bg-blue-700"
            />
            <ChannelCard
              channel="instagram"
              name="إنستغرام"
              iconComponent={<InstagramIcon className="h-8 w-8" />}
              bgColor="bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400"
              buttonColor="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            />
            <ChannelCard
              channel="tiktok"
              name="تيك توك"
              iconComponent={<TikTokChannelIcon className="h-8 w-8" />}
              bgColor="bg-black"
              buttonColor="bg-black hover:bg-gray-900"
              comingSoon
            />
            <ChannelCard
              channel="telegram"
              name="تليجرام"
              iconComponent={<TelegramIcon className="h-8 w-8" />}
              bgColor="bg-sky-500"
              buttonColor="bg-sky-500 hover:bg-sky-600"
              comingSoon
            />
            <ChannelCard
              channel="email"
              name="البريد"
              iconComponent={<Mail className="h-8 w-8 text-white" />}
              bgColor="bg-gray-600"
              buttonColor="bg-gray-600 hover:bg-gray-700"
              comingSoon
            />
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">معلومات العمل</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business-name">اسم العمل</Label>
                <Input id="business-name" placeholder="اسم شركتك" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-email">البريد الإلكتروني</Label>
                <Input id="business-email" type="email" placeholder="email@example.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-phone">رقم الهاتف</Label>
                <Input id="business-phone" placeholder="+966 XXX XXX XXX" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="working-hours">ساعات العمل</Label>
                <Input id="working-hours" placeholder="9:00 صباحاً - 5:00 مساءً" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">الإعدادات العامة</h3>
            <div className="space-y-4">
              {/* Default AI Toggle - Featured */}
              <div className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <img src={genieIcon} alt="المارد" className="w-6 h-6" />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">تفعيل المارد تلقائياً</Label>
                    <p className="text-sm text-muted-foreground">
                      تفعيل المارد لجميع المحادثات الجديدة بشكل افتراضي
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={defaultAiEnabled} 
                  onCheckedChange={handleToggleDefaultAi}
                  disabled={loadingAiSetting}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>الإشعارات</Label>
                  <p className="text-sm text-muted-foreground">
                    تلقي إشعارات عند وصول رسائل جديدة
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>الإشعارات الصوتية</Label>
                  <p className="text-sm text-muted-foreground">
                    تشغيل صوت عند وصول رسالة جديدة
                  </p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>الوضع الداكن</Label>
                  <p className="text-sm text-muted-foreground">
                    تفعيل الوضع الداكن للواجهة
                  </p>
                </div>
                <Switch />
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-start gap-4">
        <Button>حفظ التغييرات</Button>
        <Button variant="outline">إلغاء</Button>
      </div>
    </div>
  );
};

export default Settings;
