import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Instagram, CheckCircle, XCircle, Loader2, LogIn, LogOut, Copy } from 'lucide-react';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const InstagramSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const { toast } = useToast();

  const webhookUrl = `${SUPABASE_URL}/functions/v1/instagram-webhook`;
  // const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;
  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  useEffect(() => {
    loadSettings();
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'instagram_connected') {
      toast({
        title: 'تم الربط بنجاح',
        description: `تم ربط إنستغرام بنجاح`,
      });
      window.history.replaceState({}, '', '/settings');
      loadSettings();
    } else if (params.get('error') && params.get('error').includes('instagram')) {
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
      .eq('channel', 'instagram')
      .single();

    if (data) {
      const config = data.config as any;
      setIsConnected(data.is_connected || false);
      setAccountName(config?.account_name || '');
      setAccountId(config?.instagram_account_id || '');
      setVerifyToken(config?.verify_token || 'almared_instagram_webhook');
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    const scope = 'instagram_basic,instagram_manage_messages,pages_show_list,pages_messaging';
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
        .eq('channel', 'instagram');

      setIsConnected(false);
      setAccountName('');
      setAccountId('');
      setVerifyToken('');

      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل حساب إنستغرام بنجاح',
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
          <Instagram className="h-5 w-5 text-pink-600" />
          Instagram Direct
          {isConnected ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-gray-400" />
          )}
        </CardTitle>
        <CardDescription>
          {isConnected 
            ? `متصل: @${accountName}` 
            : 'قم بتسجيل الدخول لربط حساب إنستغرام بيزنس'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isConnected ? (
          <>
            <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <div className="flex items-center gap-2 text-pink-700 dark:text-pink-400 font-medium">
                <CheckCircle className="h-5 w-5" />
                متصل بنجاح
              </div>
              <p className="text-sm text-pink-600 dark:text-pink-500 mt-1">
                @{accountName} (ID: {accountId})
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
            <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <p className="text-sm text-pink-700 dark:text-pink-400">
                سيتم توجيهك إلى فيسبوك لتسجيل الدخول وربط حساب إنستغرام بيزنس.
              </p>
            </div>

            <Button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <LogIn className="h-4 w-4 ml-2" />
              )}
              تسجيل الدخول بإنستغرام
            </Button>
          </>
        )}

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-3">إعداد Webhook في Meta Developer</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>اذهب إلى <a href="https://developers.facebook.com" target="_blank" className="text-primary underline">Meta for Developers</a></li>
            <li>اختر تطبيقك ثم اذهب إلى Instagram {'>'} Settings</li>
            <li>في قسم Webhooks، اضغط Add Callback URL</li>
            <li>أدخل Webhook URL و Verify Token المعروضين أعلاه</li>
            <li>اشترك في الأحداث: messages</li>
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
