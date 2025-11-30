import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock, User, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import ChatView from "@/components/ChatView";
import facebookIcon from "@/assets/facebook.png";
import genieIcon from "@/assets/genie-icon.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
}

const Inbox = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [importing, setImporting] = useState(false);

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
      .select('id, customer_name, customer_phone, customer_email, customer_avatar, channel, status, last_message_at, created_at, updated_at, assigned_to, tags, ai_enabled')
      .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAI = async (conversationId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ ai_enabled: !currentState })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, ai_enabled: !currentState }
          : conv
      ));

      toast.success(!currentState ? "تم تفعيل المساعد الذكي" : "تم إيقاف المساعد الذكي");

      // If AI is being enabled, immediately trigger auto-reply to check for unreplied messages
      if (!currentState) {
        console.log('[TOGGLE-AI] AI enabled, triggering auto-reply check...');
        await supabase.functions.invoke('auto-reply-messages');
      }
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast.error("فشل في تحديث إعدادات المساعد الذكي");
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
    if (channel === 'facebook') {
      return <img src={facebookIcon} alt="Facebook" className="w-4 h-4" />;
    }
    return null;
  };

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-import-messages');
      
      if (error) throw error;
      
      fetchConversations();
    } catch (error) {
      console.error('Error importing messages:', error);
    } finally {
      setImporting(false);
    }
  }, []);

  // Auto-import messages every 10 seconds
  useEffect(() => {
    const autoImportInterval = setInterval(() => {
      handleImport();
    }, 10000); // 10 seconds

    return () => {
      clearInterval(autoImportInterval);
    };
  }, [handleImport]);

  const handleDeleteAll = async () => {
    try {
      // First delete all messages associated with conversations
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .gte('created_at', '1970-01-01'); // Match all rows

      if (messagesError) throw messagesError;

      // Then delete all conversations
      const { error: conversationsError } = await supabase
        .from('conversations')
        .delete()
        .gte('created_at', '1970-01-01'); // Match all rows

      if (conversationsError) throw conversationsError;

      setConversations([]);
      setSelectedConversation(null);
      toast.success("تم حذف جميع المحادثات والرسائل بنجاح");
    } catch (error) {
      console.error('Error deleting conversations:', error);
      toast.error("فشل في حذف المحادثات");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">البريد الوارد الموحد</h1>
          <p className="text-muted-foreground mt-1">جميع محادثاتك من كل القنوات في مكان واحد</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={handleImport}
            disabled={importing}
          >
            <Download className="w-4 h-4 ml-2" />
            {importing ? "جاري الاستيراد..." : "استيراد الرسائل"}
          </Button>
          <Button variant="outline">تصفية</Button>
          <Button 
            variant="destructive" 
            onClick={() => setShowDeleteDialog(true)}
            disabled={conversations.length === 0}
          >
            <Trash2 className="w-4 h-4 ml-2" />
            حذف الكل
          </Button>
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
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow relative ${
                  selectedConversation?.id === conversation.id ? 'border-primary shadow-md' : ''
                } ${conversation.ai_enabled ? 'genie-card-animated-bg' : ''}`}
                onClick={() => setSelectedConversation(conversation)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{conversation.customer_name}</h3>
                      <div className="flex items-center gap-1">
                        {getChannelIcon(conversation.channel)}
                        <Badge variant="secondary" className="text-xs">
                          {getChannelName(conversation.channel)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={conversation.ai_enabled ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAI(conversation.id, conversation.ai_enabled || false);
                    }}
                    className={`gap-2 ${conversation.ai_enabled ? 'bg-green-500 hover:bg-green-600 text-white animate-pulse' : ''}`}
                  >
                    <img src={genieIcon} alt="Genie" className={`w-5 h-5 ${conversation.ai_enabled ? 'animate-pulse' : ''}`} />
                    {conversation.ai_enabled ? "تعطيل المارد" : "تفعيل المارد"}
                  </Button>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف جميع المحادثات؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف جميع المحادث��ت والرسائل نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Inbox;
