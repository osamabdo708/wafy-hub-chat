import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, User, Phone, Mail, Bot } from "lucide-react";
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
  customerAvatar?: string;
  channel: string;
  onClose?: () => void;
}

const ChatView = ({ 
  conversationId, 
  customerName, 
  customerPhone, 
  customerEmail,
  customerAvatar,
  channel 
}: ChatViewProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [checkingAI, setCheckingAI] = useState(false);
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
      // Insert message to database
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: newMessage.trim(),
          sender_type: 'agent'
        });

      if (error) throw error;

      // Send message to Facebook if it's a Facebook conversation
      if (channel === 'facebook' && customerPhone) {
        const { error: sendError } = await supabase.functions.invoke('send-facebook-message', {
          body: {
            recipientId: customerPhone,
            message: newMessage.trim()
          }
        });

        if (sendError) {
          console.error('Error sending to Facebook:', sendError);
          toast.error('تم حفظ الرسالة لكن فشل إرسالها إلى فيسبوك');
          setSending(false);
          return;
        }
      }

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

  const handleCheckAIResponse = async () => {
    setCheckingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-ai-responses');
      
      if (error) throw error;
      
      toast.success('تم فحص المحادثات والرد بالذكاء الاصطناعي');
    } catch (error) {
      console.error('Error checking AI responses:', error);
      toast.error('فشل في تشغيل المساعد الذكي');
    } finally {
      setCheckingAI(false);
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
              <AvatarImage src={customerAvatar} alt={customerName} />
              <AvatarFallback>
                <User className="w-5 h-5 text-primary" />
              </AvatarFallback>
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
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCheckAIResponse}
              disabled={checkingAI}
            >
              <Bot className="w-4 h-4 ml-1" />
              {checkingAI ? 'جاري الفحص...' : 'تشغيل الذكاء الاصطناعي'}
            </Button>
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
      <ScrollArea className="flex-1 p-4 max-h-[400px]" ref={scrollRef}>
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
