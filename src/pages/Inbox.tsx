import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Conversation {
  id: string;
  customer_name: string;
  channel: string;
  last_message_at: string;
  status: string;
  customer_phone?: string;
  customer_email?: string;
}

const Inbox = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">البريد الوارد الموحد</h1>
          <p className="text-muted-foreground mt-1">جميع محادثاتك من كل القنوات في مكان واحد</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">تصفية</Button>
          <Button>محادثة جديدة</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {loading ? (
            <Card className="p-4">
              <p className="text-center text-muted-foreground">جاري التحميل...</p>
            </Card>
          ) : conversations.length === 0 ? (
            <Card className="p-4">
              <p className="text-center text-muted-foreground">لا توجد محادثات بعد</p>
            </Card>
          ) : (
            conversations.map((conversation) => (
              <Card 
                key={conversation.id} 
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{conversation.customer_name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {getChannelName(conversation.channel)}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-2">
                  {conversation.customer_phone || conversation.customer_email}
                </p>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(conversation.last_message_at), { 
                      addSuffix: true,
                      locale: ar 
                    })}
                  </div>
                  <Badge variant={
                    conversation.status === "جديد" ? "default" :
                    conversation.status === "مفتوح" ? "secondary" :
                    "outline"
                  }>
                    {conversation.status}
                  </Badge>
                </div>
              </Card>
            ))
          )}
        </div>

        <Card className="lg:col-span-2 p-6">
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
      </div>
    </div>
  );
};

export default Inbox;
