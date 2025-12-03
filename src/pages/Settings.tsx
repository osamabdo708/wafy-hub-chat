import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Bot, Link, Building, MessageCircle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { WhatsAppSettings } from "@/components/WhatsAppSettings";
import { FacebookSettings } from "@/components/FacebookSettings";
import { InstagramSettings } from "@/components/InstagramSettings";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const testOpenAIConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('test-openai-connection');

      if (error) throw error;

      if (data.success) {
        setConnectionStatus('success');
        toast({
          title: "نجح الاتصال",
          description: "تم الاتصال بـ OpenAI بنجاح",
        });
      } else {
        throw new Error(data.error || 'فشل الاتصال');
      }
    } catch (error) {
      console.error('Error testing OpenAI connection:', error);
      setConnectionStatus('error');
      toast({
        title: "فشل الاتصال",
        description: error instanceof Error ? error.message : "تعذر الاتصال بـ OpenAI",
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">الإعدادات</h1>
        <p className="text-muted-foreground mt-1">إدارة إعدادات المنصة والتكاملات</p>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ai">
            <Bot className="w-4 h-4 ml-2" />
            الذكاء الاصطناعي
          </TabsTrigger>
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

        <TabsContent value="ai" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">إعدادات الذكاء الاصطناعي</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openai-key">مفتاح OpenAI API</Label>
                <div className="flex gap-2">
                  <Input 
                    id="openai-key" 
                    type="password" 
                    placeholder="تم حفظ المفتاح بأمان" 
                    disabled
                    className="flex-1"
                  />
                  <Button 
                    onClick={testOpenAIConnection}
                    disabled={testingConnection}
                    variant="outline"
                    className="gap-2"
                  >
                    {testingConnection && <Loader2 className="w-4 h-4 animate-spin" />}
                    {connectionStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {connectionStatus === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
                    {testingConnection ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  تم تكوين مفتاح OpenAI API بشكل آمن. استخدم زر "اختبار الاتصال" للتحقق من صحة المفتاح.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ai-model">نموذج الذكاء الاصطناعي</Label>
                <select 
                  id="ai-model"
                  className="w-full p-2 border border-input rounded-md bg-background"
                >
                  <option>gpt-4</option>
                  <option>gpt-3.5-turbo</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>تفعيل اقتراحات الذكاء الاصطناعي</Label>
                  <p className="text-sm text-muted-foreground">
                    السماح للذكاء الاصطناعي باقتراح المنتجات والخدمات
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>إنشاء مسودات الطلبات تلقائياً</Label>
                  <p className="text-sm text-muted-foreground">
                    السماح للذكاء الاصطناعي بإنشاء مسودات الطلبات
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </Card>
        </TabsContent>

	        <TabsContent value="channels" className="space-y-4">
	          <h3 className="text-lg font-bold mb-4">قنوات التواصل الاجتماعي</h3>
	          <div className="space-y-4">
	            <WhatsAppSettings />
	            <FacebookSettings />
	            <InstagramSettings />
	          </div>
	          
	          <Card className="p-6">
	            <h3 className="text-lg font-bold mb-4">قنوات أخرى</h3>
	            <div className="space-y-4">
	              {[
	                { name: "تليجرام", status: "غير متصل", color: "bg-blue-400/20", iconColor: "text-blue-400" },
	                { name: "البريد الإلكتروني", status: "غير متصل", color: "bg-gray-500/20", iconColor: "text-gray-500" }
	              ].map((channel) => (
	                <div 
	                  key={channel.name}
	                  className="flex items-center justify-between p-4 border border-border rounded-lg"
	                >
	                  <div className="flex items-center gap-3">
	                    <div className={`w-10 h-10 rounded-full ${channel.color} flex items-center justify-center`}>
	                      <MessageCircle className={`w-5 h-5 ${channel.iconColor}`} />
	                    </div>
	                    <div>
	                      <p className="font-medium">{channel.name}</p>
	                      <p className="text-sm text-muted-foreground">{channel.status}</p>
	                    </div>
	                  </div>
	                  <Button variant="outline" disabled>
	                    قريباً
	                  </Button>
	                </div>
	              ))}
	            </div>
	          </Card>
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
