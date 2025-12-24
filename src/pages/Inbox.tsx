import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Clock, User, Wifi, WifiOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import ChatView from "@/components/ChatView";
import agentIcon from "@/assets/agent-icon.png";
import { AgentSelector } from "@/components/AgentSelector";
import {
  MessengerIcon, 
  InstagramIcon, 
  WhatsAppIcon, 
  TikTokChannelIcon,
  getChannelIconComponent 
} from "@/components/ChannelIcons";

interface Agent {
  id: string;
  name: string;
  is_ai: boolean;
}

interface Conversation {
  id: string;
  customer_name: string;
  channel: string;
  last_message_at: string;
  status: string;
  customer_phone?: string;
  customer_email?: string;
  customer_avatar?: string;
  ai_enabled?: boolean;
  unread_count?: number;
  assigned_agent_id?: string | null;
  assigned_agent?: Agent | null;
}

type ChannelType = 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | 'email';
type FilterType = 'all' | 'facebook' | 'instagram' | 'whatsapp' | 'tiktok';

interface ConnectedChannel {
  channel: ChannelType;
  is_connected: boolean;
}

const Inbox = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [connectedChannels, setConnectedChannels] = useState<ChannelType[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Fetch connected channels first
  useEffect(() => {
    const initChannels = async () => {
      await fetchConnectedChannels();
    };
    initChannels();

    // Subscribe to channel integration changes - these will be re-subscribed
    // after we have the workspace ID
  }, []);

  // Workspace-scoped channel subscriptions
  useEffect(() => {
    if (!workspaceId) return;

    // Subscribe to channel integration changes for THIS workspace only
    const legacyChannel = supabase
      .channel(`workspace_${workspaceId}_integrations`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_integrations',
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => {
          fetchConnectedChannels();
        }
      )
      .subscribe();

    // Subscribe to new channel_connections table for THIS workspace
    const connectionsChannel = supabase
      .channel(`workspace_${workspaceId}_connections`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_connections',
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => {
          fetchConnectedChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(legacyChannel);
      supabase.removeChannel(connectionsChannel);
    };
  }, [workspaceId]);

  // Fetch conversations when connected channels change
  useEffect(() => {
    if (!loadingChannels) {
      fetchConversations();

      // Subscribe to real-time updates - WORKSPACE-SCOPED channels
      // Each workspace gets its own channel to prevent cross-workspace updates
      const conversationsChannel = supabase
        .channel(`workspace_${workspaceId}_conversations`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `workspace_id=eq.${workspaceId}`
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      // Subscribe to message changes for unread count updates - WORKSPACE-SCOPED
      const messagesChannel = supabase
        .channel(`workspace_${workspaceId}_messages`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            // Only refetch if we have a workspace context
            if (workspaceId) {
              fetchConversations();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(conversationsChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [connectedChannels, loadingChannels]);

  const fetchConnectedChannels = async () => {
    try {
      // Get current user's workspace
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found');
        setConnectedChannels([]);
        setLoadingChannels(false);
        return;
      }

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (!workspace) {
        console.error('No workspace found for user');
        setConnectedChannels([]);
        setLoadingChannels(false);
        return;
      }

      setWorkspaceId(workspace.id);

      // Fetch from legacy channel_integrations for THIS workspace only
      const { data: legacyData, error: legacyError } = await supabase
        .from('channel_integrations')
        .select('channel, is_connected')
        .eq('is_connected', true)
        .eq('workspace_id', workspace.id);

      if (legacyError) {
        console.error('Error fetching legacy integrations:', legacyError);
      }
      
      // Also fetch from new channel_connections table for THIS workspace only
      const { data: connectionsData, error: connectionsError } = await supabase
        .from('channel_connections')
        .select('provider, status')
        .eq('status', 'connected')
        .eq('workspace_id', workspace.id);

      if (connectionsError) {
        console.error('Error fetching channel connections:', connectionsError);
      }

      // Normalize legacy channel names: new OAuth flow stores channel as `${provider}_${provider_channel_id}`
      // but conversations still use the base provider name (facebook/instagram/whatsapp/tiktok).
      const normalizeChannel = (channel: string): ChannelType => {
        const base = channel.split('_')[0] as ChannelType;
        return base;
      };

      // Combine channels from both sources (deduplicated)
      const legacyChannels = (legacyData || []).map((ch: ConnectedChannel) => normalizeChannel(ch.channel));
      const newChannels = (connectionsData || []).map((conn: { provider: string }) => normalizeChannel(conn.provider));
      
      const allChannels = [...new Set([...legacyChannels, ...newChannels])];
      setConnectedChannels(allChannels);
    } catch (error) {
      console.error('Error fetching connected channels:', error);
      setConnectedChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  const fetchConversations = async () => {
    try {
      // We need a workspace id to scope conversations
      if (!workspaceId) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // If no channels are connected, show empty state
      if (connectedChannels.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch conversations only for connected channels
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, customer_name, customer_phone, customer_email, customer_avatar, channel, status, last_message_at, created_at, updated_at, assigned_to, tags, ai_enabled, assigned_agent_id')
        .in('channel', connectedChannels)
        .eq('workspace_id', workspaceId)
        .order('last_message_at', { ascending: false });

      if (conversationsError) throw conversationsError;

      // Fetch agents for assigned conversations
      const agentIds = [...new Set((conversationsData || []).map(c => c.assigned_agent_id).filter(Boolean))];
      let agentsMap: Record<string, Agent> = {};
      
      if (agentIds.length > 0) {
        const { data: agentsData } = await supabase
          .from('agents')
          .select('id, name, is_ai')
          .in('id', agentIds);
        
        agentsMap = (agentsData || []).reduce((acc, agent) => {
          acc[agent.id] = agent;
          return acc;
        }, {} as Record<string, Agent>);
      }

      // Fetch unread counts for each conversation
      const conversationsWithUnread = await Promise.all(
        (conversationsData || []).map(async (conv) => {
          const { count, error: countError } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('is_read', false)
            .eq('sender_type', 'customer');

          if (countError) {
            console.error('Error fetching unread count:', countError);
            return { 
              ...conv, 
              unread_count: 0,
              assigned_agent: conv.assigned_agent_id ? agentsMap[conv.assigned_agent_id] : null
            };
          }

          return { 
            ...conv, 
            unread_count: count || 0,
            assigned_agent: conv.assigned_agent_id ? agentsMap[conv.assigned_agent_id] : null
          };
        })
      );

      setConversations(conversationsWithUnread);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignAgent = async (conversationId: string, agentId: string | null) => {
    try {
      // Check if the assigned agent is AI (المارد)
      let isAiAgent = false;
      if (agentId) {
        const { data: agent } = await supabase
          .from('agents')
          .select('is_ai')
          .eq('id', agentId)
          .maybeSingle();
        isAiAgent = agent?.is_ai || false;
      }

      const { error } = await supabase
        .from('conversations')
        .update({ 
          assigned_agent_id: agentId,
          ai_enabled: isAiAgent
        })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, assigned_agent_id: agentId, ai_enabled: isAiAgent }
          : conv
      ));

      toast.success(agentId ? "تم تعيين الوكيل بنجاح" : "تم إلغاء التعيين");

      // If AI agent is assigned, immediately trigger auto-reply
      if (isAiAgent) {
        console.log('[ASSIGN-AGENT] AI agent assigned, triggering auto-reply check...');
        await supabase.functions.invoke('auto-reply-messages');
      }
    } catch (error) {
      console.error('Error assigning agent:', error);
      toast.error("فشل في تعيين الوكيل");
    }
  };

  const markMessagesAsRead = async (conversationId: string) => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'customer')
        .eq('is_read', false);

      // Update local state
      setConversations(conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, unread_count: 0 }
          : conv
      ));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    if (conversation.unread_count && conversation.unread_count > 0) {
      markMessagesAsRead(conversation.id);
    }
  };

  const getChannelName = (channel: string) => {
    const channelMap: Record<string, string> = {
      'whatsapp': 'واتساب',
      'facebook': 'فيسبوك',
      'instagram': 'إنستغرام',
      'telegram': 'تليجرام',
      'email': 'البريد الإلكتروني'
    };
    return channelMap[channel] || channel;
  };

  const getChannelIcon = (channel: string) => {
    return getChannelIconComponent(channel, "w-4 h-4");
  };

  // Auto-reply check periodically for AI-enabled conversations
  useEffect(() => {
    if (connectedChannels.length === 0) return;

    // Auto-reply check every 15 seconds
    const autoReplyInterval = setInterval(async () => {
      try {
        await supabase.functions.invoke('auto-reply-messages');
      } catch (error) {
        console.error('[INBOX] Auto-reply error:', error);
      }
    }, 15000);

    return () => {
      clearInterval(autoReplyInterval);
    };
  }, [connectedChannels]);

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);

  // No channels connected state
  if (!loadingChannels && connectedChannels.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">البريد الوارد الموحد</h1>
            <p className="text-muted-foreground mt-1">جميع محادثاتك من كل القنوات في مكان واحد</p>
          </div>
        </div>

        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <WifiOff className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">لا توجد قنوات متصلة</h3>
              <p className="text-muted-foreground max-w-md">
                يرجى ربط قناة واحدة على الأقل (فيسبوك، إنستغرام، واتساب) من صفحة الإعدادات لبدء استقبال الرسائل
              </p>
            </div>
            <Button variant="default" onClick={() => window.location.href = '/settings'}>
              الذهاب للإعدادات
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Filter conversations based on active filter
  const filteredConversations = activeFilter === 'all' 
    ? conversations 
    : conversations.filter(conv => conv.channel === activeFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">البريد الوارد الموحد</h1>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-sm px-2 py-1">
                {totalUnread} غير مقروءة
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">القنوات المتصلة:</p>
            <div className="flex items-center gap-1">
              {connectedChannels.map((ch) => (
                <Badge key={ch} variant="outline" className="text-xs flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-green-500" />
                  {getChannelName(ch)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Channel Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12">
          <TabsTrigger value="all" className="flex items-center gap-2 text-sm">
            <MessageSquare className="w-4 h-4" />
            الكل
          </TabsTrigger>
          <TabsTrigger value="facebook" className="flex items-center gap-2 text-sm">
            <MessengerIcon className="w-4 h-4" />
            ماسنجر
          </TabsTrigger>
          <TabsTrigger value="instagram" className="flex items-center gap-2 text-sm">
            <InstagramIcon className="w-4 h-4" />
            إنستا
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2 text-sm">
            <WhatsAppIcon className="w-4 h-4" />
            واتساب
          </TabsTrigger>
          <TabsTrigger value="tiktok" className="flex items-center gap-2 text-sm">
            <TikTokChannelIcon className="w-4 h-4" />
            تيك توك
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {loading || loadingChannels ? (
            <Card className="p-4">
              <p className="text-center text-muted-foreground">جاري التحميل...</p>
            </Card>
          ) : filteredConversations.length === 0 ? (
            <Card className="p-4">
              <p className="text-center text-muted-foreground">
                {activeFilter === 'all' ? 'لا توجد محادثات بعد' : `لا توجد محادثات ${getChannelName(activeFilter)}`}
              </p>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {filteredConversations.map((conversation) => (
              <Card 
                key={conversation.id} 
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
                  selectedConversation?.id === conversation.id ? 'border-primary shadow-md' : ''
                } ${conversation.ai_enabled ? 'genie-card-animated-bg' : ''}`}
                onClick={() => handleSelectConversation(conversation)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={conversation.customer_avatar}
                          alt={conversation.customer_name}
                        />
                        <AvatarFallback>
                          <User className="w-5 h-5 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                      {/* Unread badge on avatar */}
                      {(conversation.unread_count ?? 0) > 0 && (
                        <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className={`font-semibold ${conversation.unread_count && conversation.unread_count > 0 ? 'text-foreground' : ''}`}>
                        {conversation.customer_name}
                      </h3>
                      <div className="flex items-center gap-1">
                        {getChannelIcon(conversation.channel)}
                        <Badge variant="secondary" className="text-xs">
                          {getChannelName(conversation.channel)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {/* Agent indicator */}
                  {conversation.assigned_agent && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                      conversation.assigned_agent.is_ai 
                        ? 'bg-purple-500/10 text-purple-600' 
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {conversation.assigned_agent.is_ai ? (
                        <img src={agentIcon} alt="المارد" className="w-4 h-4" />
                      ) : (
                        <User className="w-3 h-3" />
                      )}
                      {conversation.assigned_agent.name}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(conversation.last_message_at), { 
                      addSuffix: true,
                      locale: ar 
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <div onClick={(e) => e.stopPropagation()}>
                      <AgentSelector
                        value={conversation.assigned_agent_id || null}
                        onChange={(agentId) => handleAssignAgent(conversation.id, agentId)}
                      />
                    </div>
                    <Badge variant={
                      conversation.status === "جديد" ? "default" :
                      conversation.status === "مفتوح" ? "secondary" :
                      "outline"
                    }>
                      {conversation.status}
                    </Badge>
                  </div>
                </div>
              </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedConversation ? (
            <ChatView
              conversationId={selectedConversation.id}
              customerName={selectedConversation.customer_name}
              customerPhone={selectedConversation.customer_phone}
              customerEmail={selectedConversation.customer_email}
              customerAvatar={selectedConversation.customer_avatar}
              channel={selectedConversation.channel}
            />
          ) : (
            <Card className="p-6">
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <MessageSquare className="w-16 h-16 text-muted-foreground" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">اختر محادثة</h3>
                  <p className="text-muted-foreground">
                    اختر محادثة من القائمة للبدء في الرد على العملاء
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
};

export default Inbox;
