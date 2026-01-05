import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Package, User, Phone, Mail, MapPin, CreditCard, Truck, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const OrderDetails = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, image_url),
          services(name),
          shipping_methods(name, price)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!orderId
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'مسودة': return 'bg-gray-500';
      case 'قيد الانتظار': return 'bg-yellow-500';
      case 'مؤكد': return 'bg-blue-500';
      case 'مكتمل': return 'bg-green-500';
      case 'ملغي': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'مدفوع': return 'bg-green-500';
      case 'في انتظار الدفع': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">الطلب غير موجود</p>
        <Button onClick={() => navigate('/orders')}>
          العودة للطلبات
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/orders')}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">طلب #{order.order_number}</h1>
            <p className="text-muted-foreground text-sm">
              {format(new Date(order.created_at), 'PPpp', { locale: ar })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge className={getStatusColor(order.status || '')}>{order.status}</Badge>
          <Badge className={getPaymentStatusColor(order.payment_status || '')}>{order.payment_status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              معلومات العميل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{order.customer_name}</span>
            </div>
            {order.customer_phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{order.customer_phone}</span>
              </div>
            )}
            {order.customer_email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{order.customer_email}</span>
              </div>
            )}
            {order.shipping_address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <span>{order.shipping_address}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              تفاصيل الطلب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.products && (
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span>المنتج: {order.products.name}</span>
              </div>
            )}
            {order.services && (
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span>الخدمة: {order.services.name}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span>طريقة الدفع: {order.payment_method || 'غير محدد'}</span>
            </div>
            {order.shipping_methods && (
              <div className="flex items-center gap-3">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>الشحن: {order.shipping_methods.name} ({order.shipping_methods.price} ₪)</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>المصدر: {order.source_platform || 'غير محدد'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              معلومات الدفع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المبلغ الإجمالي</span>
              <span className="text-2xl font-bold">{order.price} ₪</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">حالة الدفع</span>
              <Badge className={getPaymentStatusColor(order.payment_status || '')}>
                {order.payment_status}
              </Badge>
            </div>
            {order.payment_link && (
              <div className="pt-2">
                <a 
                  href={order.payment_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm"
                >
                  رابط الدفع
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {order.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                ملاحظات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default OrderDetails;
