import { useState, useEffect, useRef } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, CheckCircle, XCircle, Loader2, LogIn, LogOut } from 'lucide-react';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const WhatsAppSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const { toast } = useToast();
  const popupRef = useRef<Window | null>(null);
  const popupCheckInterval = useRef<NodeJS.Timeout | null>(null);

  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  useEffect(() => {
    loadSettings();

    // Listen for OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success' && event.data?.channel === 'whatsapp') {
        // Close popup if still open
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        clearPopupCheck();
        
        toast({
          title: 'تم الربط بنجاح',
          description: `تم ربط واتساب بنجاح`,
        });
        loadSettings();
        setIsLoading(false);
      } else if (event.data?.type === 'oauth_error') {
        // Close popup if still open
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        clearPopupCheck();
        
        toast({
          title: 'خطأ في الربط',
          description: event.data.error,
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearPopupCheck();
    };
  }, []);

  const clearPopupCheck = () => {
    if (popupCheckInterval.current) {
      clearInterval(popupCheckInterval.current);
      popupCheckInterval.current = null;
    }
  };

  const loadSettings = async () => {
    const { data } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('channel', 'whatsapp')
      .maybeSingle();

    if (data) {
      const config = data.config as any;
      setIsConnected(data.is_connected || false);
      setPhoneNumber(config?.phone_number || '');
      setBusinessName(config?.business_name || '');
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    const scope = 'whatsapp_business_management,whatsapp_business_messaging';
    const state = `whatsapp|${oauthCallbackUrl}`;
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}`;
    
    // Open popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    popupRef.current = window.open(
      authUrl,
      'whatsapp_oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Check if popup was closed manually
    popupCheckInterval.current = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        clearPopupCheck();
        setIsLoading(false);
        // Reload settings in case OAuth completed
        loadSettings();
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('channel_integrations')
        .update({
          is_connected: false,
          config: {},
          updated_at: new Date().toISOString()
        })
        .eq('channel', 'whatsapp');

      if (error) {
        console.error('Disconnect error:', error);
        toast({
          title: 'خطأ',
          description: 'لا تملك الصلاحية لفصل الاتصال',
          variant: 'destructive',
        });
        return;
      }

      setIsConnected(false);
      setPhoneNumber('');
      setBusinessName('');

      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل حساب واتساب بنجاح',
      });
    } catch (error) {
      console.error('Disconnect error:', error);
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
