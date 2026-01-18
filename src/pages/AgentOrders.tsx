import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgentAuth } from "@/contexts/AgentAuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ShoppingCart, Search, Plus, Eye } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  price: number;
  status: string;
  payment_status: string | null;
  created_at: string;
}

const AgentOrders = () => {
  const { agent } = useAgentAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (agent) {
      fetchOrders();
    }
  }, [agent]);

  const fetchOrders = async () => {
    if (!agent) return;

    try {
      // Fetch orders where agent_name matches the logged in agent's name
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("agent_name", agent.name)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("فشل في تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      مسودة: "bg-gray-500/10 text-gray-600",
      "قيد الانتظار": "bg-yellow-500/10 text-yellow-600",
      ملغي: "bg-red-500/10 text-red-600",
      مؤكد: "bg-blue-500/10 text-blue-600",
      "تم التغليف جاهز للتوصيل": "bg-purple-500/10 text-purple-600",
      "قيد التوصيل": "bg-orange-500/10 text-orange-600",
      "تم التوصيل": "bg-teal-500/10 text-teal-600",
      عائد: "bg-pink-500/10 text-pink-600",
      مكتمل: "bg-green-500/10 text-green-600",
    };
    return colors[status] || "bg-gray-500/10 text-gray-600";
  };

  const getPaymentStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-500/10 text-gray-600";
    const colors: Record<string, string> = {
      pending: "bg-yellow-500/10 text-yellow-600",
      paid: "bg-green-500/10 text-green-600",
      failed: "bg-red-500/10 text-red-600",
    };
    return colors[status] || "bg-gray-500/10 text-gray-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">طلباتي</h1>
          <p className="text-muted-foreground mt-1">
            الطلبات التي قمت بإنشائها
          </p>
        </div>
        <Button onClick={() => navigate("/agent/pos")}>
          <Plus className="w-4 h-4 ml-2" />
          طلب جديد
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">لا توجد طلبات</h3>
          <p className="text-muted-foreground mb-4">
            لم تقم بإنشاء أي طلبات بعد
          </p>
          <Button onClick={() => navigate("/agent/pos")}>
            <Plus className="w-4 h-4 ml-2" />
            إنشاء طلب جديد
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="p-4 border-b">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الطلبات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الطلب</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الدفع</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono">{order.order_number}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{order.customer_name}</p>
                      {order.customer_phone && (
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {order.customer_phone}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{order.price.toFixed(2)} ر.س</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(order.status)} variant="secondary">
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getPaymentStatusColor(order.payment_status)} variant="secondary">
                      {order.payment_status === "paid"
                        ? "مدفوع"
                        : order.payment_status === "failed"
                        ? "فشل"
                        : "معلق"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(order.created_at), "PPp", { locale: ar })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/agent/orders/${order.id}`)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default AgentOrders;
