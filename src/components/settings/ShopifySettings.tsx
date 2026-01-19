import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ShoppingBag, 
  RefreshCw, 
  Check, 
  X, 
  Package, 
  Truck, 
  Tags,
  Download,
  Upload,
  Webhook,
  Copy,
  ExternalLink,
  ShoppingCart
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

interface ShopInfo {
  name: string;
  domain: string;
  email: string;
  currency: string;
  plan_name: string;
}

const ShopifySettings = () => {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/shopify-webhook`;

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setLoading(true);
    try {
      // Get workspace
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (workspace) {
        setWorkspaceId(workspace.id);
      }

      const { data, error } = await supabase.functions.invoke('shopify-sync', {
        body: { action: 'test_connection' }
      });

      if (error) throw error;

      if (data.success) {
        setConnected(true);
        setShopInfo(data.shop);
      } else {
        setConnected(false);
      }
    } catch (error: any) {
      console.error('Shopify connection error:', error);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (action: string, label: string) => {
    if (!workspaceId) {
      toast.error("مساحة العمل غير متوفرة");
      return;
    }

    setSyncing(action);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync', {
        body: { action, workspaceId }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`تم ${label} بنجاح`);
        if (data.synced !== undefined) {
          toast.info(`تم مزامنة ${data.synced} عنصر`);
        }
      } else {
        throw new Error(data.error || 'فشل في المزامنة');
      }
    } catch (error: any) {
      console.error(`Sync error (${action}):`, error);
      toast.error(error.message || `فشل في ${label}`);
    } finally {
      setSyncing(null);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    toast.success("تم نسخ الرابط");
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${connected ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <ShoppingBag className={`w-5 h-5 ${connected ? 'text-green-500' : 'text-red-500'}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Shopify Integration</h3>
              <p className="text-sm text-muted-foreground">
                {connected ? 'متصل بمتجر Shopify' : 'غير متصل'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? 'default' : 'destructive'} className="gap-1">
              {connected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {connected ? 'متصل' : 'غير متصل'}
            </Badge>
            <Button variant="outline" size="sm" onClick={testConnection} className="gap-1">
              <RefreshCw className="w-4 h-4" />
              فحص
            </Button>
          </div>
        </div>

        {connected && shopInfo && (
          <>
            <Separator className="mb-6" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-lg bg-muted/50 border">
                <Label className="text-sm text-muted-foreground">اسم المتجر</Label>
                <p className="font-medium mt-1">{shopInfo.name}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <Label className="text-sm text-muted-foreground">النطاق</Label>
                <p className="font-medium mt-1 text-sm" dir="ltr">{shopInfo.domain}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <Label className="text-sm text-muted-foreground">العملة</Label>
                <p className="font-medium mt-1">{shopInfo.currency}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <Label className="text-sm text-muted-foreground">الخطة</Label>
                <p className="font-medium mt-1">{shopInfo.plan_name}</p>
              </div>
            </div>
          </>
        )}

        {!connected && (
          <>
            <Separator className="mb-6" />
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm text-muted-foreground">
                تأكد من إضافة بيانات Shopify الصحيحة في الإعدادات:
              </p>
              <ul className="text-sm mt-2 space-y-1 text-muted-foreground list-disc list-inside">
                <li>SHOPIFY_STORE_URL: عنوان متجرك (مثال: mystore.myshopify.com)</li>
                <li>SHOPIFY_ACCESS_TOKEN: مفتاح الوصول من تطبيق Shopify</li>
              </ul>
            </div>
          </>
        )}
      </Card>

      {/* Sync Actions */}
      {connected && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">المزامنة</h3>
              <p className="text-sm text-muted-foreground">
                مزامنة البيانات بين النظام ومتجر Shopify
              </p>
            </div>
          </div>

          <Separator className="mb-6" />

          <div className="grid gap-4 md:grid-cols-2">
            {/* Products from Shopify */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Download className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h4 className="font-medium">استيراد المنتجات</h4>
                  <p className="text-xs text-muted-foreground">من Shopify إلى النظام</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => handleSync('sync_products_from_shopify', 'استيراد المنتجات')}
                disabled={syncing !== null}
              >
                {syncing === 'sync_products_from_shopify' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                استيراد المنتجات
              </Button>
            </div>

            {/* Products to Shopify */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Upload className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <h4 className="font-medium">تصدير المنتجات</h4>
                  <p className="text-xs text-muted-foreground">من النظام إلى Shopify</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => handleSync('sync_all_products_to_shopify', 'تصدير المنتجات')}
                disabled={syncing !== null}
              >
                {syncing === 'sync_all_products_to_shopify' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                تصدير المنتجات
              </Button>
            </div>

            {/* Categories to Shopify */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Tags className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <h4 className="font-medium">مزامنة الفئات</h4>
                  <p className="text-xs text-muted-foreground">إنشاء مجموعات في Shopify</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => handleSync('sync_categories_to_shopify', 'مزامنة الفئات')}
                disabled={syncing !== null}
              >
                {syncing === 'sync_categories_to_shopify' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Tags className="w-4 h-4" />
                )}
                مزامنة الفئات
              </Button>
            </div>

            {/* Orders from Shopify */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <ShoppingCart className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h4 className="font-medium">استيراد الطلبات</h4>
                  <p className="text-xs text-muted-foreground">من Shopify إلى النظام</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => handleSync('sync_orders_from_shopify', 'استيراد الطلبات')}
                disabled={syncing !== null}
              >
                {syncing === 'sync_orders_from_shopify' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                استيراد الطلبات
              </Button>
            </div>

            {/* Shipping Methods Info */}
            <div className="p-4 rounded-lg border bg-card md:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Truck className="w-4 h-4 text-cyan-500" />
                </div>
                <div>
                  <h4 className="font-medium">طرق الشحن</h4>
                  <p className="text-xs text-muted-foreground">
                    يتم إعداد طرق الشحن يدوياً في لوحة تحكم Shopify
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => window.open(`https://${shopInfo?.domain}/admin/settings/shipping`, '_blank')}
              >
                <ExternalLink className="w-4 h-4" />
                فتح إعدادات الشحن
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Webhook URL */}
      {connected && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Webhook className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Webhook URL</h3>
              <p className="text-sm text-muted-foreground">
                أضف هذا الرابط في إعدادات Webhooks في Shopify
              </p>
            </div>
          </div>

          <Separator className="mb-6" />

          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Webhook URL</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                className="h-8 px-2"
              >
                {copiedUrl === 'webhook' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-sm font-mono bg-background p-3 rounded border break-all" dir="ltr">
              {webhookUrl}
            </p>
          </div>

          <div className="mt-4 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <h4 className="font-semibold text-sm mb-2">الأحداث المدعومة:</h4>
            <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
              <li>orders/create - إنشاء طلب جديد</li>
              <li>orders/updated - تحديث طلب</li>
              <li>orders/cancelled - إلغاء طلب</li>
              <li>products/create - إنشاء منتج جديد</li>
              <li>products/update - تحديث منتج</li>
              <li>products/delete - حذف منتج</li>
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ShopifySettings;
