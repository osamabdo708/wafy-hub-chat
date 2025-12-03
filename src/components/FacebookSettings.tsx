import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Facebook, CheckCircle, XCircle, Loader2, LogIn, LogOut, Copy } from 'lucide-react';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const FacebookSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [pageName, setPageName] = useState('');
  const [pageId, setPageId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const { toast } = useToast();

  const webhookUrl = `${SUPABASE_URL}/functions/v1/facebook-webhook`;
  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  useEffect(() => {
    loadSettings();
    // Check for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'facebook_connected') {
      toast({
        title: 'تم الربط بنجاح',
        description: `تم ربط صفحة ${params.get('page') || 'فيسبوك'} بنجاح`,
      });
      // Clear URL params
      window.history.replaceState({}, '', '/settings');
      loadSettings();
    } else if (params.get('error')) {
      toast({
        title: 'خطأ في الربط',
        description: params.get('error'),
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('channel', 'facebook')
      .single();

    if (data) {
      const config = data.config as any;
      setIsConnected(data.is_connected || false);
      setPageName(config?.page_name || '');
      setPageId(config?.page_id || '');
      setVerifyToken(config?.verify_token || '');
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    const scope = 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
    const authUrl = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code`;
    
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await supabase
        .from('channel_integrations')
        .update({
          is_connected: false,
          config: {}
        })
        .eq('channel', 'facebook');

      setIsConnected(false);
      setPageName('');
      setPageId('');
      setVerifyToken('');

      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل حساب فيسبوك بنجاح',
      });
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ أثناء فصل الاتصال',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'تم النسخ',
      description: `تم نسخ ${label}`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Facebook className="h-5 w-5 text-blue-600" />
          Facebook Messenger
          {isConnected ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-gray-400" />
          )}
        </CardTitle>
        <CardDescription>
          {isConnected 
            ? `متصل بصفحة: ${pageName}` 
            : 'قم بتسجيل الدخول لربط صفحة فيسبوك الخاصة بك'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isConnected ? (
          <>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                <CheckCircle className="h-5 w-5" />
                متصل بنجاح
              </div>
              <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                صفحة: {pageName} (ID: {pageId})
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Verify Token</Label>
                <div className="flex gap-2">
                  <Input value={verifyToken} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(verifyToken, 'Verify Token')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Button
              onClick={handleDisconnect}
              variant="destructive"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <LogOut className="h-4 w-4 ml-2" />
              )}
              فصل الاتصال
            </Button>
          </>
        ) : (
          <>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                سيتم توجيهك إلى فيسبوك لتسجيل الدخول وتحديد الصفحة التي تريد ربطها.
              </p>
            </div>

            <Button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <LogIn className="h-4 w-4 ml-2" />
              )}
              تسجيل الدخول بفيسبوك
            </Button>
          </>
        )}

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-3">إعداد Webhook في Meta Developer</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>اذهب إلى <a href="https://developers.facebook.com" target="_blank" className="text-primary underline">Meta for Developers</a></li>
            <li>اختر تطبيقك ثم اذهب إلى Messenger {'>'} Settings</li>
            <li>في قسم Webhooks، اضغط Add Callback URL</li>
            <li>أدخل Webhook URL و Verify Token المعروضين أعلاه</li>
            <li>اشترك في الأحداث: messages, messaging_postbacks</li>
          </ol>
          
          <div className="mt-4 p-3 bg-background rounded border">
            <p className="text-xs font-mono break-all">
              <strong>Webhook URL:</strong><br />
              {webhookUrl}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
