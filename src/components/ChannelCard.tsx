import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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
  comingSoon = false 
}: ChannelCardProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

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

      // Subscribe to realtime changes for channel integrations
      const channel_sub = supabase
        .channel(`channel_integration_${channel}_${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'channel_integrations',
            filter: `workspace_id=eq.${workspaceId}`
          },
          () => {
            loadSettings();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel_sub);
      };
    }
  }, [channel, comingSoon, workspaceId]);

  const loadSettings = async () => {
    // Only load for supported channels
    if (!['whatsapp', 'facebook', 'instagram', 'telegram'].includes(channel)) return;
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
        setAccountInfo(config?.display_phone_number || config?.phone_number || 'WhatsApp Business');
      } else if (channel === 'facebook') {
        setAccountInfo(config?.page_name || 'Facebook Page');
      } else if (channel === 'instagram') {
        const username = config?.account_name;
        setAccountInfo(username ? (username.startsWith('@') ? username : `@${username}`) : 'Instagram Account');
      } else if (channel === 'telegram') {
        const botName = config?.bot_username || config?.bot_name;
        setAccountInfo(botName ? (botName.startsWith('@') ? botName : `@${botName}`) : 'Telegram Bot');
      }
    } else {
      setIsConnected(false);
      setAccountInfo('');
    }
  };

  return (
    <div className={cn(
      "relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-300",
      isConnected 
        ? "border-green-500/50 bg-green-500/5" 
        : "border-border bg-card"
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
        {comingSoon ? 'قريباً' : (isConnected ? accountInfo : 'يتم التحكم من المشرف')}
      </p>

      {/* Status badge */}
      {comingSoon ? (
        <Badge variant="secondary" className="w-full justify-center py-2">
          قريباً
        </Badge>
      ) : (
        <Badge 
          variant={isConnected ? "default" : "outline"} 
          className={cn(
            "w-full justify-center py-2",
            isConnected && "bg-green-600 hover:bg-green-700"
          )}
        >
          {isConnected ? 'نشط' : 'غير نشط'}
        </Badge>
      )}
    </div>
  );
};
