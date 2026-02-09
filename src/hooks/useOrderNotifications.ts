import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playOrderNotificationSound } from "@/utils/orderNotificationSound";

export interface OrderNotification {
  id: string;
  order_number: string;
  customer_name: string;
  price: number;
  created_at: string;
  read: boolean;
}

export const useOrderNotifications = () => {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
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

  // Load recent orders as initial notifications
  useEffect(() => {
    if (!workspaceId) return;

    const loadRecentOrders = async () => {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, price, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (orders) {
        setNotifications(orders.map(order => ({
          ...order,
          read: true // Existing orders are marked as read
        })));
      }
    };

    loadRecentOrders();
  }, [workspaceId]);

  // Subscribe to new orders
  useEffect(() => {
    if (!workspaceId) return;

    const ordersChannel = supabase
      .channel(`order_notifications_${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          const newOrder = payload.new as any;
          
          // Only notify for orders in this workspace
          if (newOrder.workspace_id === workspaceId) {
            // Play notification sound
            playOrderNotificationSound();

            // Add to notifications list
            setNotifications(prev => [{
              id: newOrder.id,
              order_number: newOrder.order_number,
              customer_name: newOrder.customer_name,
              price: newOrder.price,
              created_at: newOrder.created_at,
              read: false
            }, ...prev].slice(0, 20)); // Keep only 20 most recent
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, [workspaceId]);

  const markAsRead = useCallback((orderId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === orderId ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead
  };
};
