import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ArrowRight, 
  Phone, 
  Mail, 
  Calendar, 
  ShoppingCart, 
  MessageSquare, 
  Crown, 
  Star, 
  UserCheck, 
  UserPlus,
  Package,
  DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getChannelIconComponent } from "@/components/ChannelIcons";
import chatIcon from "@/assets/chat-icon.png";

interface Order {
  id: string;
  order_number: string;
  price: number;
  status: string;
  payment_status: string | null;
  created_at: string;
  products: { name: string } | null;
  services: { name: string } | null;
}

interface Conversation {
  id: string;
  channel: string;
  status: string;
  last_message_at: string;
  customer_name: string;
}

interface ClientData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
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
  const colors: Record<string, string> = {
    'مكتمل': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'تم التوصيل': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    'مؤكد': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'قيد الانتظار': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'قيد التوصيل': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'تم التغليف جاهز للتوصيل': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'ملغي': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'عائد': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
};

const ClientDetails = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  const fetchClientData = async () => {
    if (!clientId) return;

    try {
      // Fetch client
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (clientError) throw clientError;
      setClient(clientData);

      // Fetch orders
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, order_number, price, status, payment_status, created_at, products(name), services(name)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      setOrders(ordersData || []);

      // Fetch conversations
      const { data: conversationsData } = await supabase
        .from("conversations")
        .select("id, channel, status, last_message_at, customer_name")
        .eq("client_id", clientId)
        .order("last_message_at", { ascending: false });

      setConversations(conversationsData || []);
    } catch (error) {
      console.error("Error fetching client data:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSpent = orders.reduce((sum, order) => sum + (order.price || 0), 0);
  const classification = getClientClassification(orders.length);
  const IconComponent = classification.icon;

  if (loading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-muted-foreground">لم يتم العثور على العميل</p>
        <Button onClick={() => navigate("/clients")} className="mt-4">
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للعملاء
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarImage src={client.avatar_url || undefined} alt={client.name} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border mt-1 ${classification.bgColor} ${classification.textColor} ${classification.borderColor}`}>
              <IconComponent className="h-4 w-4" />
              <span className="font-medium text-sm">{classification.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                <p className="font-medium" dir="ltr">{client.phone || "غير متوفر"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                <p className="font-medium text-sm">{client.email || "غير متوفر"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">تاريخ التسجيل</p>
                <p className="font-medium">{format(new Date(client.created_at), "PPP", { locale: ar })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/20">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المشتريات</p>
                <p className="font-bold text-lg text-primary">{formatCurrency(totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              الطلبات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{orders.length}</span>
              <Button variant="outline" size="sm" onClick={() => navigate(`/orders?client=${clientId}`)}>
                عرض الكل
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              المحادثات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{conversations.length}</span>
              {conversations.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate(`/inbox?conversation=${conversations[0].id}`)}
                >
                  <img src={chatIcon} alt="Chat" className="w-4 h-4 ml-2" />
                  فتح آخر محادثة
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversations List */}
      {conversations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              المحادثات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conversations.map((conv) => (
                <div 
                  key={conv.id} 
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/inbox?conversation=${conv.id}`)}
                >
                  <div className="flex items-center gap-3">
                    {getChannelIconComponent(conv.channel, "w-6 h-6")}
                    <div>
                      <p className="font-medium capitalize">{conv.channel}</p>
                      <p className="text-sm text-muted-foreground">
                        آخر تفاعل: {format(new Date(conv.last_message_at), "PPp", { locale: ar })}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <img src={chatIcon} alt="Chat" className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders List */}
      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              سجل الطلبات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الطلب</TableHead>
                  <TableHead className="text-right">المنتج/الخدمة</TableHead>
                  <TableHead className="text-right">السعر</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow 
                    key={order.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono">{order.order_number}</TableCell>
                    <TableCell>{order.products?.name || order.services?.name || "-"}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(order.price)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status || "")}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(order.created_at), "PPP", { locale: ar })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientDetails;