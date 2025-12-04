import { useState, useEffect } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Facebook, CheckCircle, XCircle, Loader2, LogIn, LogOut } from 'lucide-react';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const FacebookSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [pageName, setPageName] = useState('');
  const { toast } = useToast();

  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  useEffect(() => {
    loadSettings();

    // Listen for OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success' && event.data?.channel === 'facebook') {
        toast({
          title: 'تم الربط بنجاح',
          description: `تم ربط صفحة ${event.data.account} بنجاح`,
        });
        loadSettings();
        setIsLoading(false);
      } else if (event.data?.type === 'oauth_error') {
        toast({
          title: 'خطأ في الربط',
          description: event.data.error,
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    const scope = 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code&state=facebook`;
    
    // Open popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    window.open(
      authUrl,
      'facebook_oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );
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

  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Facebook className="h-8 w-8 text-blue-600" />
        <div>
          <CardTitle className="text-lg">فيسبوك مسنجر</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                متصل بصفحة: {pageName}
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
          className="shrink-0 bg-blue-600 hover:bg-blue-700"
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
