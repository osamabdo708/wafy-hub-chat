import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Smartphone, Key, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const MobileIntegration = () => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [openEndpoint, setOpenEndpoint] = useState<string | null>("login");

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({
      title: "تم النسخ",
      description: "تم نسخ النص إلى الحافظة",
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const endpoints = [
    {
      id: "login",
      name: "تسجيل الدخول",
      method: "POST",
      path: "/mobile-login",
      description: "تسجيل دخول الوكيل والحصول على رمز الجلسة",
      icon: Key,
      request: {
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          email: "agent@example.com",
          password: "password123"
        }
      },
      response: {
        success: true,
        data: {
          agent: {
            id: "uuid",
            name: "اسم الوكيل",
            email: "agent@example.com",
            avatar_url: "https://...",
            workspace_id: "uuid",
            workspace_name: "اسم مساحة العمل"
          },
          session_token: "token_string",
          expires_at: "2026-02-21T00:00:00.000Z"
        }
      }
    },
    {
      id: "conversations",
      name: "قائمة المحادثات",
      method: "GET",
      path: "/mobile-conversations",
      description: "جلب المحادثات المعينة للوكيل مع التصفية والتصفح",
      icon: MessageSquare,
      request: {
        headers: {
          "x-session-token": "session_token_from_login"
        },
        queryParams: {
          page: "1",
          limit: "20",
          status: "active | closed | all",
          channel: "whatsapp | telegram | facebook | instagram"
        }
      },
      response: {
        success: true,
        data: {
          conversations: [
            {
              id: "uuid",
              customer_name: "اسم العميل",
              customer_phone: "+966...",
              customer_avatar: "https://...",
              channel: "whatsapp",
              status: "active",
              ai_enabled: false,
              created_at: "2026-01-22T00:00:00.000Z",
              updated_at: "2026-01-22T00:00:00.000Z",
              last_message: {
                id: "uuid",
                content: "آخر رسالة",
                sender_type: "customer",
                created_at: "2026-01-22T00:00:00.000Z"
              },
              unread_count: 3
            }
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 50,
            total_pages: 3
          }
        }
      }
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6 border-2 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
            <Smartphone className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">تكامل تطبيق الموبايل</h2>
            <p className="text-sm text-muted-foreground">
              واجهات برمجة التطبيقات REST للتكامل مع تطبيقات الجوال
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Base URL:</span>
            <code className="bg-muted px-2 py-1 rounded text-sm flex-1 overflow-x-auto">
              {baseUrl}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(baseUrl, "baseUrl")}
            >
              {copiedField === "baseUrl" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-bold">نقاط النهاية المتاحة</h3>
        
        {endpoints.map((endpoint) => (
          <Collapsible
            key={endpoint.id}
            open={openEndpoint === endpoint.id}
            onOpenChange={(open) => setOpenEndpoint(open ? endpoint.id : null)}
          >
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <endpoint.icon className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={endpoint.method === "POST" ? "default" : "secondary"}
                          className={endpoint.method === "POST" ? "bg-green-500" : "bg-blue-500"}
                        >
                          {endpoint.method}
                        </Badge>
                        <span className="font-medium">{endpoint.name}</span>
                      </div>
                      <code className="text-xs text-muted-foreground">{endpoint.path}</code>
                    </div>
                  </div>
                  {openEndpoint === endpoint.id ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="border-t p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Full URL:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs flex-1 overflow-x-auto">
                      {baseUrl}{endpoint.path}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`${baseUrl}${endpoint.path}`, endpoint.id)}
                    >
                      {copiedField === endpoint.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">الطلب (Request)</h4>
                      <div className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                        <div className="mb-2">
                          <span className="text-muted-foreground">Headers:</span>
                          <pre className="mt-1">
                            {JSON.stringify(endpoint.request.headers, null, 2)}
                          </pre>
                        </div>
                        {'body' in endpoint.request && (
                          <div>
                            <span className="text-muted-foreground">Body:</span>
                            <pre className="mt-1">
                              {JSON.stringify(endpoint.request.body, null, 2)}
                            </pre>
                          </div>
                        )}
                        {'queryParams' in endpoint.request && (
                          <div>
                            <span className="text-muted-foreground">Query Parameters:</span>
                            <pre className="mt-1">
                              {JSON.stringify(endpoint.request.queryParams, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold mb-2">الاستجابة (Response)</h4>
                      <div className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                        <pre>
                          {JSON.stringify(endpoint.response, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      <Card className="p-4 bg-amber-500/10 border-amber-500/20">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">ملاحظات مهمة:</p>
            <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
              <li>يجب استخدام <code className="bg-muted px-1 rounded">x-session-token</code> في جميع الطلبات المحمية</li>
              <li>رمز الجلسة صالح لمدة 30 يوم</li>
              <li>جميع الاستجابات تتضمن رسائل خطأ بالعربية والإنجليزية</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MobileIntegration;
