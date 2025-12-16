import { useState, useEffect, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2, LogIn, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const FACEBOOK_APP_ID = '1749195285754662';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ChannelCardProps {
  channel: string;
  name: string;
  iconComponent: ReactNode;
  bgColor: string;
  buttonColor?: string;
  comingSoon?: boolean;
}

export const ChannelCard = ({ 
  channel, 
  name, 
  iconComponent, 
  bgColor,
  buttonColor,
  comingSoon = false 
}: ChannelCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const { toast } = useToast();

  // Use the new unified OAuth callback
  const oauthCallbackUrl = `${SUPABASE_URL}/functions/v1/channel-oauth-callback`;

  useEffect(() => {
    // Get the user's workspace
    const getWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id')
          .eq('owner_user_id', user.id)
          .limit(1);
        
        if (workspaces && workspaces.length > 0) {
          setWorkspaceId(workspaces[0].id);
        }
      }
    };
    getWorkspace();
  }, []);

  useEffect(() => {
    if (!comingSoon && workspaceId) {
      loadSettings();

      // Listen for OAuth popup messages
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'oauth_success' && event.data?.channel === channel) {
          toast({
            title: 'تم الربط بنجاح',
            description: `تم ربط ${name}: ${event.data.account}`,
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
    }
  }, [channel, comingSoon, workspaceId, name, toast]);

  const loadSettings = async () => {
    // Only load for supported channels
    if (!['whatsapp', 'facebook', 'instagram'].includes(channel)) return;
    if (!workspaceId) return;
    
    // Get the integration for this channel in THIS workspace
    const { data, error } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('channel', channel as any)
      .eq('is_connected', true)
      .eq('workspace_id', workspaceId)
      .limit(1);

    if (error) {
      console.error(`Error loading ${channel} settings:`, error);
      return;
    }

    if (data && data.length > 0) {
      const config = data[0].config as any;
      setIsConnected(true);
      
      // Set account info based on channel type
      if (channel === 'whatsapp') {
        setAccountInfo(config?.display_name || config?.phone_number || 'WhatsApp Business');
      } else if (channel === 'facebook') {
        setAccountInfo(config?.page_name || 'Facebook Page');
      } else if (channel === 'instagram') {
        const username = config?.account_name;
        setAccountInfo(username ? (username.startsWith('@') ? username : `@${username}`) : 'Instagram Account');
      }
    } else {
      setIsConnected(false);
      setAccountInfo('');
    }
  };

  const getOAuthScope = () => {
    switch (channel) {
      case 'whatsapp':
        return 'whatsapp_business_management,whatsapp_business_messaging,business_management';
      case 'facebook':
        return 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
      case 'instagram':
        return 'instagram_basic,instagram_manage_messages,pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
      default:
        return '';
    }
  };

  const handleLogin = () => {
    if (!workspaceId) {
      toast({
        title: 'خطأ',
        description: 'لم يتم العثور على مساحة العمل',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const scope = getOAuthScope();
    // State format: channelType|redirectUri|workspaceId
    const state = `${channel}|${oauthCallbackUrl}|${workspaceId}`;
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}&auth_type=rerequest&return_scopes=true&display=popup`;
    
    // Open popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    window.open(
      authUrl,
      `${channel}_oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );
  };

  const handleDisconnect = async () => {
    if (!workspaceId) return;
    
    setIsLoading(true);
    try {
      // Get all conversation IDs for this channel in this workspace
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('channel', channel as any)
        .eq('workspace_id', workspaceId);

      // Delete all messages for these conversations
      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        await supabase
          .from('messages')
          .delete()
          .in('conversation_id', conversationIds);
      }

      // Delete all conversations for this channel in this workspace
      await supabase
        .from('conversations')
        .delete()
        .eq('channel', channel as any)
        .eq('workspace_id', workspaceId);

      // Set integration to disconnected (don't delete, just mark as disconnected)
      const { error } = await supabase
        .from('channel_integrations')
        .update({
          is_connected: false,
          updated_at: new Date().toISOString()
        })
        .eq('channel', channel as any)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('Disconnect error:', error);
        toast({
          title: 'خطأ',
          description: 'فشل في فصل الاتصال',
          variant: 'destructive',
        });
        return;
      }

      setIsConnected(false);
      setAccountInfo('');

      toast({
        title: 'تم فصل الاتصال',
        description: `تم فصل ${name} وحذف جميع المحادثات بنجاح`,
      });
    } catch (error) {
      console.error('Error disconnecting:', error);
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
    <div className={cn(
      "relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-300 hover:shadow-lg",
      isConnected 
        ? "border-green-500/50 bg-green-500/5" 
        : "border-border bg-card hover:border-muted-foreground/30"
    )}>
      {/* Status indicator */}
      <div className={cn(
        "absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        isConnected 
          ? "bg-green-500/20 text-green-600" 
          : "bg-muted text-muted-foreground"
      )}>
        {isConnected ? (
          <>
            <CheckCircle className="h-3 w-3" />
            متصل
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3" />
            غير متصل
          </>
        )}
      </div>

      {/* Icon */}
      <div className={cn(
        "w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mt-4",
        bgColor
      )}>
        {iconComponent}
      </div>

      {/* Name */}
      <h3 className="text-lg font-semibold mb-1">{name}</h3>
      
      {/* Account info */}
      <p className="text-sm text-muted-foreground mb-4 h-5 truncate max-w-full">
        {isConnected ? accountInfo : (comingSoon ? 'قريباً' : 'اضغط للربط')}
      </p>

      {/* Action button */}
      {comingSoon ? (
        <Button variant="outline" disabled className="w-full">
          قريباً
        </Button>
      ) : isConnected ? (
        <Button
          onClick={handleDisconnect}
          variant="outline"
          disabled={isLoading}
          className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
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
          className={cn("w-full", buttonColor)}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <LogIn className="h-4 w-4 ml-2" />
          )}
          ربط الحساب
        </Button>
      )}
    </div>
  );
};
