import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, MessageSquare, Clock, Users, ShoppingBag, TrendingUp } from "lucide-react";

interface DashboardStats {
  totalSales: number;
  totalOrders: number;
  totalConversations: number;
  activeConversations: number;
  totalClients: number;
  avgResponseTime: string;
  todaySales: number;
  todayOrders: number;
}

const DashboardCards = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    totalOrders: 0,
    totalConversations: 0,
    activeConversations: 0,
    totalClients: 0,
    avgResponseTime: "—",
    todaySales: 0,
    todayOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const completedStatuses = ["مكتمل", "تم التوصيل"];

      const [
        ordersRes,
        todayOrdersRes,
        convsRes,
        activeConvsRes,
        clientsRes,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("price, status")
          .eq("workspace_id", workspace.id)
          .in("status", completedStatuses),
        supabase
          .from("orders")
          .select("price, status")
          .eq("workspace_id", workspace.id)
          .in("status", completedStatuses)
          .gte("created_at", todayISO),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id)
          .in("status", ["جديد", "مفتوح"]),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id),
      ]);

      const totalSales = (ordersRes.data || []).reduce((sum, o) => sum + Number(o.price || 0), 0);
      const todaySales = (todayOrdersRes.data || []).reduce((sum, o) => sum + Number(o.price || 0), 0);

      // Calculate avg response time from recent conversations
      let avgResponseTime = "—";
      const { data: recentConvs } = await supabase
        .from("conversations")
        .select("id, created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (recentConvs && recentConvs.length > 0) {
        let totalMs = 0;
        let count = 0;
        for (const conv of recentConvs.slice(0, 20)) {
          const { data: firstAgentMsg } = await supabase
            .from("messages")
            .select("created_at")
            .eq("conversation_id", conv.id)
            .in("sender_type", ["agent", "system"])
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          if (firstAgentMsg) {
            const diff = new Date(firstAgentMsg.created_at).getTime() - new Date(conv.created_at).getTime();
            if (diff > 0 && diff < 86400000) {
              totalMs += diff;
              count++;
            }
          }
        }
        if (count > 0) {
          const avgMs = totalMs / count;
          const avgMin = Math.round(avgMs / 60000);
          if (avgMin < 60) {
            avgResponseTime = `${avgMin} دقيقة`;
          } else {
            const hours = Math.floor(avgMin / 60);
            const mins = avgMin % 60;
            avgResponseTime = `${hours}س ${mins}د`;
          }
        }
      }

      setStats({
        totalSales,
        totalOrders: (ordersRes.data || []).length,
        totalConversations: convsRes.count || 0,
        activeConversations: activeConvsRes.count || 0,
        totalClients: clientsRes.count || 0,
        avgResponseTime,
        todaySales,
        todayOrders: (todayOrdersRes.data || []).length,
      });
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    {
      label: "إجمالي المبيعات",
      value: `${stats.totalSales.toLocaleString()} ر.س`,
      sub: `اليوم: ${stats.todaySales.toLocaleString()} ر.س`,
      icon: DollarSign,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "إجمالي الطلبات",
      value: stats.totalOrders.toString(),
      sub: `اليوم: ${stats.todayOrders}`,
      icon: ShoppingBag,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "المحادثات",
      value: stats.totalConversations.toString(),
      sub: `نشطة: ${stats.activeConversations}`,
      icon: MessageSquare,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "العملاء",
      value: stats.totalClients.toString(),
      sub: null,
      icon: Users,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      label: "معدل الاستجابة",
      value: stats.avgResponseTime,
      sub: "متوسط وقت أول رد",
      icon: Clock,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      label: "نمو المبيعات",
      value: stats.todayOrders > 0 ? `+${stats.todayOrders}` : "0",
      sub: "طلبات اليوم",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-16 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold">{card.value}</p>
          <p className="text-xs text-muted-foreground">{card.label}</p>
          {card.sub && (
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          )}
        </Card>
      ))}
    </div>
  );
};

export default DashboardCards;
