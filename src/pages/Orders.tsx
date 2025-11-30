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
import { ShoppingCart, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const Orders = () => {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          products (name),
          services (name)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "قيد الانتظار").length,
    confirmed: orders.filter(o => o.status === "مؤكد").length,
    cancelled: orders.filter(o => o.status === "ملغي").length,
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
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">لا توجد طلبات بعد</div>
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
                <TableHead className="text-right">المصدر</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>
                    <div>{order.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    {order.products?.name || order.services?.name || "-"}
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
                    {order.created_at ? format(new Date(order.created_at), "yyyy-MM-dd") : "-"}
                  </TableCell>
                  <TableCell>
                    {order.ai_generated ? (
                      <Badge variant="outline" className="bg-primary/10">AI</Badge>
                    ) : (
                      <Badge variant="outline">يدوي</Badge>
                    )}
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
