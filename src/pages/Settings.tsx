import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Bot, Link, Building } from "lucide-react";
import { WhatsAppSettings } from "@/components/WhatsAppSettings";

const Settings = () => {
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
                <Input 
                  id="openai-key" 
                  type="password" 
                  placeholder="sk-..." 
                />
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
          <WhatsAppSettings />
          
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">قنوات أخرى</h3>
            <div className="space-y-4">
              {[
                { name: "فيسبوك مسنجر", status: "غير متصل", color: "bg-muted" },
                { name: "إنستغرام", status: "غير متصل", color: "bg-muted" },
                { name: "تليجرام", status: "غير متصل", color: "bg-muted" },
                { name: "البريد الإلكتروني", status: "غير متصل", color: "bg-muted" }
              ].map((channel) => (
                <div 
                  key={channel.name}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${channel.color}`}></div>
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
