import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, CheckCircle, XCircle, Loader2, LogIn, LogOut, Copy } from 'lucide-react';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const WhatsAppSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const { toast } = useToast();

  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  useEffect(() => {
    loadSettings();
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'whatsapp_connected') {
      toast({
        title: 'تم الربط بنجاح',
        description: `تم ربط واتساب بنجاح`,
      });
      window.history.replaceState({}, '', '/settings');
      loadSettings();
    } else if (params.get('error') && params.get('error').includes('whatsapp')) {
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
      .eq('channel', 'whatsapp')
      .single();

    if (data) {
      const config = data.config as any;
      setIsConnected(data.is_connected || false);
      setPhoneNumber(config?.phone_number || '');
      setBusinessName(config?.business_name || '');
      setVerifyToken(config?.verify_token || 'almared_whatsapp_webhook');
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    const scope = 'whatsapp_business_management,whatsapp_business_messaging';
    const authUrl = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code&state=whatsapp`;
    
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
        .eq('channel', 'whatsapp');

      setIsConnected(false);
      setPhoneNumber('');
      setBusinessName('');
      setVerifyToken('');

      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل حساب واتساب بنجاح',
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
        <MessageSquare className="h-8 w-8 text-green-600" />
        <div>
          <CardTitle className="text-lg">واتساب بيزنس</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                متصل: {businessName || phoneNumber}
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
          className="shrink-0 bg-green-600 hover:bg-green-700"
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
