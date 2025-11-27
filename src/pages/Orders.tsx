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

const mockOrders = [
  {
    id: "ORD-001",
    customer: "أحمد محمد",
    product: "خدمة مساج علاجي",
    price: "200 ريال",
    status: "قيد الانتظار",
    date: "2024-01-15"
  },
  {
    id: "ORD-002",
    customer: "فاطمة علي",
    product: "منتج العناية بالبشرة",
    price: "150 ريال",
    status: "مؤكد",
    date: "2024-01-14"
  },
  {
    id: "ORD-003",
    customer: "خالد سعيد",
    product: "جلسة استشارة",
    price: "100 ريال",
    status: "مكتمل",
    date: "2024-01-13"
  }
];

const Orders = () => {
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
              <h3 className="text-2xl font-bold mt-1">142</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">قيد الانتظار</p>
              <h3 className="text-2xl font-bold mt-1 text-warning">23</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-warning" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">مؤكدة</p>
              <h3 className="text-2xl font-bold mt-1 text-success">89</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">ملغاة</p>
              <h3 className="text-2xl font-bold mt-1 text-destructive">8</h3>
            </div>
            <ShoppingCart className="w-8 h-8 text-destructive" />
          </div>
        </Card>
      </div>

      <Card>
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
            {mockOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell>{order.product}</TableCell>
                <TableCell>{order.price}</TableCell>
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
                <TableCell>{order.date}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">عرض</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default Orders;
