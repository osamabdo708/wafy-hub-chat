import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Phone, ShoppingCart, Crown, UserPlus, UserCheck, Star, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { getChannelIconComponent } from "@/components/ChannelIcons";
import chatIcon from "@/assets/chat-icon.png";
interface LatestOrder {
  id: string;
  order_number: string;
  price: number;
  status: string;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  latest_order: LatestOrder | null;
  conversation_count: number;
  channel: string | null;
  conversation_id: string | null;
}

type ClientClassification = "جديد" | "عادي" | "متكرر" | "VIP";

interface ClassificationStyle {
  label: ClientClassification;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: typeof Crown;
}

const getClientClassification = (orderCount: number): ClassificationStyle => {
  if (orderCount >= 5) return { 
    label: "VIP", 
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-700 dark:text-amber-400",
    borderColor: "border-amber-300 dark:border-amber-700",
    icon: Crown
  };
  if (orderCount >= 2) return { 
    label: "متكرر", 
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    icon: Star
  };
  if (orderCount === 1) return { 
    label: "عادي", 
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-400",
    borderColor: "border-blue-300 dark:border-blue-700",
    icon: UserCheck
  };
  return { 
    label: "جديد", 
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    textColor: "text-slate-600 dark:text-slate-400",
    borderColor: "border-slate-300 dark:border-slate-600",
    icon: UserPlus
  };
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'مكتمل':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'مؤكد':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'قيد الانتظار':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'ملغي':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchClients = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Fetch clients with their data
      const { data: clientsData } = await supabase
        .from("clients")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });

      if (clientsData) {
        // Get enriched data for each client
        const enrichedClients = await Promise.all(
          clientsData.map(async (client) => {
            // Get order count and total spent
            const { data: ordersData } = await supabase
              .from("orders")
              .select("id, order_number, price, status, created_at")
              .eq("client_id", client.id)
              .order("created_at", { ascending: false });

            const orders = ordersData || [];
            const orderCount = orders.length;
            const totalSpent = orders.reduce((sum, order) => sum + (order.price || 0), 0);
            const latestOrder = orders[0] || null;

            // Get conversation count and channel
            const { data: conversationsData } = await supabase
              .from("conversations")
              .select("id, channel")
              .eq("client_id", client.id)
              .order("last_message_at", { ascending: false });

            const conversations = conversationsData || [];
            const conversationCount = conversations.length;
            const channel = conversations[0]?.channel || null;
            const conversationId = conversations[0]?.id || null;

            return {
              ...client,
              order_count: orderCount,
              total_spent: totalSpent,
              latest_order: latestOrder,
              conversation_count: conversationCount,
              channel,
              conversation_id: conversationId,
            };
          })
        );

        setClients(enrichedClients);
      }

      setLoading(false);
    };

    fetchClients();
  }, []);

  const totalClients = clients.length;
  const vipClients = clients.filter(c => c.order_count >= 5).length;
  const repeatingClients = clients.filter(c => c.order_count >= 2 && c.order_count < 5).length;
  const totalRevenue = clients.reduce((sum, c) => sum + c.total_spent, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : totalClients}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء VIP</CardTitle>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              <Crown className="h-3 w-3" />
              <span className="text-xs font-medium">VIP</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{loading ? <Skeleton className="h-8 w-16" /> : vipClients}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء متكررين</CardTitle>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
              <Star className="h-3 w-3" />
              <span className="text-xs font-medium">متكرر</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{loading ? <Skeleton className="h-8 w-16" /> : repeatingClients}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة العملاء</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لا يوجد عملاء بعد</p>
              <p className="text-sm">سيتم إنشاء العملاء تلقائياً عند استلام المحادثات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right font-semibold">العميل</TableHead>
                  <TableHead className="text-right font-semibold">التواصل</TableHead>
                  <TableHead className="text-right font-semibold">المحادثة</TableHead>
                  <TableHead className="text-right font-semibold">الطلبات</TableHead>
                  <TableHead className="text-right font-semibold">إجمالي المشتريات</TableHead>
                  <TableHead className="text-right font-semibold">آخر طلب</TableHead>
                  <TableHead className="text-right font-semibold">التصنيف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const classification = getClientClassification(client.order_count);
                  const IconComponent = classification.icon;
                  return (
                    <TableRow key={client.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div 
                          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={client.avatar_url || undefined} alt={client.name} />
                            <AvatarFallback className="bg-primary/10 text-primary font-medium">
                              {getInitials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-primary hover:underline">{client.name}</p>
                            {client.channel && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {getChannelIconComponent(client.channel, "w-4 h-4")}
                                <span className="text-xs text-muted-foreground capitalize">{client.channel}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {client.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span dir="ltr" className="text-muted-foreground">{client.phone}</span>
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground">
                            {client.conversation_count} محادثة
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.conversation_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/inbox?conversation=${client.conversation_id}`);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                          >
                            <img src={chatIcon} alt="Chat" className="w-5 h-5" />
                            <span className="text-sm font-medium text-primary">فتح المحادثة</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-sm">لا يوجد محادثة</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders?client=${client.id}`);
                          }}
                          className="flex items-center gap-2 hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                            <Package className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-semibold text-primary underline-offset-2 hover:underline">{client.order_count}</span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-primary">
                          {formatCurrency(client.total_spent)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {client.latest_order ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{client.latest_order.order_number}</span>
                              <Badge className={`text-xs ${getStatusColor(client.latest_order.status || '')}`}>
                                {client.latest_order.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(client.latest_order.created_at).toLocaleDateString("ar-SA")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">لا يوجد طلبات</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${classification.bgColor} ${classification.textColor} ${classification.borderColor}`}>
                          <IconComponent className="h-4 w-4" />
                          <span className="font-medium text-sm">{classification.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Clients;
