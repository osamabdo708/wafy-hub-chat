import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ShoppingCart,
  Key,
  Link2,
  Save
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

interface ShopInfo {
  name: string;
  domain: string;
  email: string;
  currency: string;
}

interface ShopifySettingsData {
  id: string;
  workspace_id: string;
  store_url: string | null;
  api_key: string | null;
  api_secret_encrypted: string | null;
  is_connected: boolean;
  shop_name: string | null;
  shop_domain: string | null;
  shop_email: string | null;
  shop_currency: string | null;
}

const ShopifySettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  // Form fields
  const [storeUrl, setStoreUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [settings, setSettings] = useState<ShopifySettingsData | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/shopify-webhook`;
  const callbackUrl = `${supabaseUrl}/functions/v1/shopify-oauth-callback`;

  useEffect(() => {
    loadSettings();
    
    // Listen for OAuth success message
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'shopify_oauth_success') {
        toast.success(`تم الاتصال بمتجر ${event.data.shop} بنجاح`);
        loadSettings();
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
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

        // Get or create shopify settings
        let { data: shopifySettings } = await supabase
          .from('shopify_settings')
          .select('*')
          .eq('workspace_id', workspace.id)
          .maybeSingle();

        if (!shopifySettings) {
          // Create initial settings
          const { data: newSettings } = await supabase
            .from('shopify_settings')
            .insert({ workspace_id: workspace.id })
            .select()
            .single();
          shopifySettings = newSettings;
        }

        if (shopifySettings) {
          setSettings(shopifySettings as ShopifySettingsData);
          setStoreUrl(shopifySettings.store_url || "");
          setApiKey(shopifySettings.api_key || "");
          setApiSecret(shopifySettings.api_secret_encrypted || "");
          setConnected(shopifySettings.is_connected || false);
          
          if (shopifySettings.is_connected) {
            setShopInfo({
              name: shopifySettings.shop_name || "",
              domain: shopifySettings.shop_domain || "",
              email: shopifySettings.shop_email || "",
              currency: shopifySettings.shop_currency || "",
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Load settings error:', error);
      toast.error("فشل في تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!workspaceId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('shopify_settings')
        .upsert({
          workspace_id: workspaceId,
          store_url: storeUrl,
          api_key: apiKey,
          api_secret_encrypted: apiSecret,
        }, { onConflict: 'workspace_id' });

      if (error) throw error;
      
      toast.success("تم حفظ الإعدادات بنجاح");
      await loadSettings();
    } catch (error: any) {
      console.error('Save settings error:', error);
      toast.error(error.message || "فشل في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const startOAuth = () => {
    if (!storeUrl || !apiKey) {
      toast.error("يرجى إدخال عنوان المتجر و API Key أولاً");
      return;
    }

    const cleanStoreUrl = storeUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    const scopes = 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory';
    const redirectUri = encodeURIComponent(callbackUrl);
    const state = workspaceId;

    const authUrl = `https://${cleanStoreUrl}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    
    // Open OAuth in popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    window.open(authUrl, 'shopify_oauth', `width=${width},height=${height},left=${left},top=${top}`);
  };

  const testConnection = async () => {
    if (!connected) {
      toast.error("يرجى إكمال عملية الربط أولاً");
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync', {
        body: { action: 'test_connection', workspaceId }
      });

      if (error) throw error;

      if (data.success) {
        setShopInfo(data.shop);
        toast.success("الاتصال يعمل بشكل صحيح");
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Connection test error:', error);
      toast.error(error.message || "فشل في اختبار الاتصال");
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

  const disconnectShopify = async () => {
    if (!workspaceId) return;
    
    try {
      const { error } = await supabase
        .from('shopify_settings')
        .update({
          access_token_encrypted: null,
          is_connected: false,
          shop_name: null,
          shop_domain: null,
          shop_email: null,
          shop_currency: null,
        })
        .eq('workspace_id', workspaceId);

      if (error) throw error;
      
      setConnected(false);
      setShopInfo(null);
      toast.success("تم قطع الاتصال بنجاح");
    } catch (error: any) {
      toast.error(error.message || "فشل في قطع الاتصال");
    }
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
      {/* API Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">إعدادات Shopify API</h3>
            <p className="text-sm text-muted-foreground">
              أدخل بيانات تطبيق Shopify الخاص بك
            </p>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeUrl">عنوان المتجر</Label>
            <Input
              id="storeUrl"
              placeholder="mystore.myshopify.com"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              مثال: mystore.myshopify.com (بدون https://)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (Client ID)</Label>
            <Input
              id="apiKey"
              placeholder="أدخل API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret (Client Secret)</Label>
            <Input
              id="apiSecret"
              type="password"
              placeholder="أدخل API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              dir="ltr"
            />
          </div>

          <Button onClick={saveSettings} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ الإعدادات
          </Button>
        </div>
      </Card>

      {/* Callback URL */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Link2 className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Callback URL</h3>
            <p className="text-sm text-muted-foreground">
              أضف هذا الرابط في إعدادات تطبيق Shopify
            </p>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Redirect URL (Callback)</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(callbackUrl, 'callback')}
              className="h-8 px-2"
            >
              {copiedUrl === 'callback' ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-sm font-mono bg-background p-3 rounded border break-all" dir="ltr">
            {callbackUrl}
          </p>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <h4 className="font-semibold text-sm mb-2">خطوات إنشاء تطبيق Shopify:</h4>
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
            <li>اذهب إلى Partners Dashboard أو Settings &gt; Apps &gt; Develop apps</li>
            <li>أنشئ تطبيق جديد</li>
            <li>في App setup، أضف Redirect URL أعلاه</li>
            <li>في API credentials، انسخ API Key و API Secret</li>
            <li>في Configuration، فعّل الصلاحيات المطلوبة (Products, Orders, Inventory)</li>
          </ol>
        </div>
      </Card>

      {/* Connection Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${connected ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
              <ShoppingBag className={`w-5 h-5 ${connected ? 'text-green-500' : 'text-orange-500'}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">حالة الاتصال</h3>
              <p className="text-sm text-muted-foreground">
                {connected ? 'متصل بمتجر Shopify' : 'غير متصل - اضغط للربط'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? 'default' : 'secondary'} className="gap-1">
              {connected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {connected ? 'متصل' : 'غير متصل'}
            </Badge>
            {connected ? (
              <>
                <Button variant="outline" size="sm" onClick={testConnection} className="gap-1">
                  <RefreshCw className="w-4 h-4" />
                  فحص
                </Button>
                <Button variant="destructive" size="sm" onClick={disconnectShopify}>
                  قطع الاتصال
                </Button>
              </>
            ) : (
              <Button onClick={startOAuth} disabled={!storeUrl || !apiKey || !apiSecret} className="gap-2">
                <Link2 className="w-4 h-4" />
                ربط المتجر
              </Button>
            )}
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
                <Label className="text-sm text-muted-foreground">البريد</Label>
                <p className="font-medium mt-1 text-sm" dir="ltr">{shopInfo.email}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <Label className="text-sm text-muted-foreground">العملة</Label>
                <p className="font-medium mt-1">{shopInfo.currency}</p>
              </div>
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
