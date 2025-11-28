import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShoppingCart, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  price: number;
  status: string;
  created_at: string;
  product_id?: string;
  service_id?: string;
  products?: { name: string } | null;
  services?: { name: string } | null;
}

const Orders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0
  });

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products:product_id (name),
          services:service_id (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrders(data || []);
      
      // Calculate stats
      const total = data?.length || 0;
      const pending = data?.filter(o => o.status === 'قيد الانتظار').length || 0;
      const confirmed = data?.filter(o => o.status === 'مؤكد').length || 0;
      const cancelled = data?.filter(o => o.status === 'ملغي').length || 0;
      
      setStats({ total, pending, confirmed, cancelled });
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الطلبات</h1>
          <p className="text-muted-foreground mt-1">إدارة جميع طلبات العملاء</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 ml-2" />
          طلب جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الطلبات</p>
              <h3 className="text-2xl font-bold mt-1">{stats.total}</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">قيد الانتظار</p>
              <h3 className="text-2xl font-bold mt-1 text-warning">{stats.pending}</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-warning" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">مؤكدة</p>
              <h3 className="text-2xl font-bold mt-1 text-success">{stats.confirmed}</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">ملغاة</p>
              <h3 className="text-2xl font-bold mt-1 text-destructive">{stats.cancelled}</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-destructive" />
          </div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            لا توجد طلبات حالياً
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الطلب</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">المنتج/الخدمة</TableHead>
                <TableHead className="text-right">السعر</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>{order.customer_name}</TableCell>
                  <TableCell>
                    {order.products?.name || order.services?.name || '-'}
                  </TableCell>
                  <TableCell>{order.price} ريال</TableCell>
                  <TableCell>
                    <Badge variant={
                      order.status === "مؤكد" ? "default" :
                      order.status === "قيد الانتظار" ? "secondary" :
                      order.status === "مكتمل" ? "outline" :
                      "destructive"
                    }>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(order.created_at), 'yyyy-MM-dd', { locale: ar })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">عرض</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default Orders;
