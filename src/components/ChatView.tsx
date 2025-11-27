import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, User, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import facebookIcon from "@/assets/facebook.png";

interface Message {
  id: string;
  content: string;
  sender_type: string;
  created_at: string;
  sender_id?: string;
}

interface ChatViewProps {
  conversationId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  channel: string;
  onClose?: () => void;
}

const ChatView = ({ 
  conversationId, 
  customerName, 
  customerPhone, 
  customerEmail,
  channel 
}: ChatViewProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('فشل تحميل الرسائل');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: newMessage.trim(),
          sender_type: 'agent'
        });

      if (error) throw error;

      // Update conversation's last_message_at
      await supabase
        .from('conversations')
        .update({ 
          last_message_at: new Date().toISOString(),
          status: 'مفتوح'
        })
        .eq('id', conversationId);

      setNewMessage("");
      toast.success('تم إرسال الرسالة');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const getChannelIcon = () => {
    if (channel === 'facebook') {
      return <img src={facebookIcon} alt="Facebook" className="w-4 h-4" />;
    }
    return null;
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{customerName}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {getChannelIcon()}
                <span>{customerPhone || customerEmail}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {customerPhone && (
              <Button variant="ghost" size="sm">
                <Phone className="w-4 h-4" />
              </Button>
            )}
            {customerEmail && (
              <Button variant="ghost" size="sm">
                <Mail className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              لا توجد رسائل بعد
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    message.sender_type === 'agent'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.sender_type === 'agent' 
                      ? 'text-primary-foreground/70' 
                      : 'text-muted-foreground'
                  }`}>
                    {formatDistanceToNow(new Date(message.created_at), { 
                      addSuffix: true,
                      locale: ar 
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Textarea
            placeholder="اكتب رسالتك..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="min-h-[60px] resize-none"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!newMessage.trim() || sending}
            size="lg"
            className="px-6"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          اضغط Enter للإرسال، Shift+Enter لسطر جديد
        </p>
      </div>
    </Card>
  );
};

export default ChatView;
