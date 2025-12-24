import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/utils/notificationSound";

export const useGlobalNotifications = () => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Get workspace ID on mount
  useEffect(() => {
    const getWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (workspace) {
        setWorkspaceId(workspace.id);
      }
    };

    getWorkspace();
  }, []);

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
