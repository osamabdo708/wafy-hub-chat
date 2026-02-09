import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/utils/notificationSound";
import { useWorkspace } from "@/hooks/useWorkspace";

export const useGlobalNotifications = () => {
  const { workspaceId } = useWorkspace();

  // Subscribe to new messages globally
  useEffect(() => {
    if (!workspaceId) return;

    const messagesChannel = supabase
      .channel(`global_notifications_${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          // Play notification sound for new customer messages
          if (payload.new && (payload.new as any).sender_type === 'customer') {
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [workspaceId]);
};
