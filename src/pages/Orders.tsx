import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShoppingCart, Plus, X, CreditCard, Banknote, Clock, CheckCircle, XCircle, AlertCircle, FileText, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";

const Orders = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    address: "",
    product_id: "",
    service_id: "",
    price: "",
    payment_method: "",
    notes: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          products (name),
          services (name),
          shipping_methods (name, price)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: orderNumberData } = await supabase.rpc("generate_order_number");
      
      const { data, error } = await supabase
        .from("orders")
        .insert({
          ...orderData,
          order_number: orderNumberData,
          status: "قيد الانتظار",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "تم إنشاء الطلب",
        description: "تم إضافة الطلب بنجاح",
      });
      setShowCreateForm(false);
      setFormData({
        customer_name: "",
        customer_phone: "",
        customer_email: "",
        address: "",
        product_id: "",
        service_id: "",
        price: "",
        payment_method: "",
        notes: "",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء الطلب",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: "مسودة" | "قيد الانتظار" | "مؤكد" | "مكتمل" | "ملغي" }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "تم تحديث الحالة",
        description: "تم تغيير حالة الطلب بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث حالة الطلب",
        variant: "destructive",
      });
    },
  });

  const deleteAllOrdersMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف جميع الطلبات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف الطلبات",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_name || !formData.customer_phone || !formData.address || !formData.payment_method) {
      toast({
        title: "خطأ",
        description: "الرجاء ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    if (!formData.product_id && !formData.service_id) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار منتج أو خدمة",
        variant: "destructive",
      });
      return;
    }

    createOrderMutation.mutate({
      customer_name: formData.customer_name,
      customer_phone: formData.customer_phone,
      customer_email: formData.customer_email || null,
      product_id: formData.product_id || null,
      service_id: formData.service_id || null,
      price: parseFloat(formData.price) || 0,
      payment_method: formData.payment_method === 'رابط دفع PayTabs' ? 'الكتروني' : 'نقدي',
      payment_status: 'في انتظار الدفع',
      notes: `العنوان: ${formData.address}${formData.notes ? `\n${formData.notes}` : ""}`,
    });
  };

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
        <div className="flex gap-2">
          {orders.length > 0 && (
            <Button 
              variant="destructive" 
              onClick={() => {
                if (confirm("هل أنت متأكد من حذف جميع الطلبات؟ لا يمكن التراجع عن هذا الإجراء.")) {
                  deleteAllOrdersMutation.mutate();
                }
              }}
              disabled={deleteAllOrdersMutation.isPending}
            >
              <Trash2 className="w-4 h-4 ml-2" />
              {deleteAllOrdersMutation.isPending ? "جاري الحذف..." : "حذف الكل"}
            </Button>
          )}
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? <X className="w-4 h-4 ml-2" /> : <Plus className="w-4 h-4 ml-2" />}
            {showCreateForm ? "إلغاء" : "طلب جديد"}
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">إنشاء طلب جديد</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">اسم العميل *</Label>
                <Input
                  id="customer_name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="أدخل اسم العميل"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_phone">رقم الهاتف *</Label>
                <Input
                  id="customer_phone"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  placeholder="أدخل رقم الهاتف"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_email">البريد الإلكتروني</Label>
                <Input
                  id="customer_email"
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                  placeholder="أدخل البريد الإلكتروني (اختياري)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_method">طريقة الدفع *</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نقدي">نقدي (الدفع عند الاستلام)</SelectItem>
                    <SelectItem value="رابط دفع PayTabs">رابط دفع PayTabs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">العنوان *</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="أدخل العنوان الكامل"
                  required
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product_id">المنتج</Label>
                <Select
                  value={formData.product_id}
                  onValueChange={(value) => {
                    const product = products.find(p => p.id === value);
                    setFormData({ 
                      ...formData, 
                      product_id: value, 
                      service_id: "",
                      price: product?.price?.toString() || ""
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر منتج" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.price} ₪
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service_id">الخدمة</Label>
                <Select
                  value={formData.service_id}
                  onValueChange={(value) => {
                    const service = services.find(s => s.id === value);
                    setFormData({ 
                      ...formData, 
                      service_id: value, 
                      product_id: "",
                      price: service?.price?.toString() || ""
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر خدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} - {service.price} ₪
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">السعر</Label>
                <Input
                  id="price"
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="أدخل السعر"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">ملاحظات إضافية</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="أضف أي ملاحظات إضافية"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending ? "جاري الإنشاء..." : "إنشاء الطلب"}
              </Button>
            </div>
          </form>
        </Card>
      )}

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
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">حالة الدفع</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المصدر</TableHead>
                <TableHead className="text-right">الفاتورة</TableHead>
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
                  <TableCell>{order.price} ₪</TableCell>
                  <TableCell>
                    <Select
                      value={order.status || "قيد الانتظار"}
                      onValueChange={(value: "مسودة" | "قيد الانتظار" | "مؤكد" | "مكتمل" | "ملغي") => updateStatusMutation.mutate({ orderId: order.id, status: value })}
                    >
                      <SelectTrigger className="w-[130px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="قيد الانتظار">قيد الانتظار</SelectItem>
                        <SelectItem value="مؤكد">مؤكد</SelectItem>
                        <SelectItem value="مكتمل">مكتمل</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      order.payment_method === 'الكتروني' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      'bg-green-100 text-green-800 border-green-300'
                    }>
                      {order.payment_method === 'الكتروني' && <CreditCard className="w-3 h-3 ml-1" />}
                      {order.payment_method !== 'الكتروني' && <Banknote className="w-3 h-3 ml-1" />}
                      {order.payment_method || 'نقدي'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge 
                            variant="outline" 
                            className={
                              order.payment_status === 'مدفوع' ? 'bg-green-100 text-green-800 border-green-300' :
                              'bg-yellow-100 text-yellow-800 border-yellow-300'
                            }
                          >
                            {order.payment_status === 'مدفوع' && <CheckCircle className="w-3 h-3 ml-1" />}
                            {order.payment_status !== 'مدفوع' && <Clock className="w-3 h-3 ml-1" />}
                            {order.payment_status === 'مدفوع' ? 'مدفوع' : 
                             order.payment_status === 'awaiting_payment' ? 'في انتظار الدفع' : 
                             order.payment_status || 'في انتظار الدفع'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {order.payment_link ? (
                            <p className="text-xs">رابط الدفع: {order.payment_link}</p>
                          ) : (
                            <p className="text-xs">لا يوجد رابط دفع</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => generateInvoicePDF(order)}
                      title="عرض الفاتورة"
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
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
