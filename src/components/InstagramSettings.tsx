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
    const authUrl = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code&state=instagram`;
    
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
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Instagram className="h-8 w-8 text-pink-600" />
        <div>
          <CardTitle className="text-lg">إنستغرام</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                متصل: @{accountName}
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-gray-400" />
                غير متصل
              </>
            )}
          </CardDescription>
        </div>
      </div>
      
      {isConnected ? (
        <Button
          onClick={handleDisconnect}
          variant="destructive"
          disabled={isLoading}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <LogOut className="h-4 w-4 ml-2" />
          )}
          فصل الاتصال
        </Button>
      ) : (
        <Button
          onClick={handleLogin}
          disabled={isLoading}
          className="shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <LogIn className="h-4 w-4 ml-2" />
          )}
          ربط الحساب
        </Button>
      )}
    </Card>
  );
};
