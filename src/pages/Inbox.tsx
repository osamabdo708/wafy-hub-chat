import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock, User, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import ChatView from "@/components/ChatView";
import facebookIcon from "@/assets/facebook.png";
import { Switch } from "@/components/ui/switch";

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
  const [importing, setImporting] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

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
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast.error("فشل في تحديث إعدادات المساعد الذكي");
    }
  };

  const handleImportFacebook = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-facebook-conversations');
      
      if (error) throw error;
      
      toast.success(data.message || 'تم استيراد المحادثات بنجاح');
      fetchConversations();
    } catch (error) {
      console.error('Error importing conversations:', error);
      toast.error('فشل استيراد المحادثات. تأكد من إعدادات فيسبوك');
    } finally {
      setImporting(false);
    }
  };
