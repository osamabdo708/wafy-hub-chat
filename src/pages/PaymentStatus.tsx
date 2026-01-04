import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  price: number;
  payment_status: string;
  status: string;
  products?: { name: string } | null;
  shipping_methods?: { name: string; price: number } | null;
}

const PaymentStatus = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber) {
        setError("رقم الطلب غير موجود");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("*, products(name), shipping_methods(name, price)")
          .eq("order_number", orderNumber)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (!data) {
          setError("الطلب غير موجود");
        } else {
          setOrder(data);
        }
      } catch (err) {
        console.error("Error fetching order:", err);
        setError("حدث خطأ أثناء جلب بيانات الطلب");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderNumber]);

  const getStatusIcon = () => {
    if (!order) return null;

    switch (order.payment_status) {
      case "paid":
        return <CheckCircle className="w-20 h-20 text-green-500" />;
      case "failed":
        return <XCircle className="w-20 h-20 text-red-500" />;
      default:
        return <Clock className="w-20 h-20 text-yellow-500" />;
    }
  };

  const getStatusText = () => {
    if (!order) return "";

    switch (order.payment_status) {
      case "paid":
        return "تم الدفع بنجاح";
      case "failed":
        return "فشل الدفع";
      case "awaiting_payment":
        return "في انتظار الدفع";
      default:
        return "حالة الدفع غير معروفة";
    }
  };

  const getStatusColor = () => {
    if (!order) return "text-muted-foreground";

    switch (order.payment_status) {
      case "paid":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-yellow-600";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-2">خطأ</h1>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-6">{getStatusIcon()}</div>
        
        <h1 className={`text-2xl font-bold mb-2 ${getStatusColor()}`}>
          {getStatusText()}
        </h1>
        
        <p className="text-muted-foreground mb-6">
          طلب رقم: <span className="font-semibold">{order?.order_number}</span>
        </p>

        <div className="border-t pt-6 space-y-3 text-right">
          <div className="flex justify-between">
            <span className="text-muted-foreground">اسم العميل:</span>
            <span className="font-medium">{order?.customer_name}</span>
          </div>

          {order?.products?.name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">المنتج:</span>
              <span className="font-medium">{order.products.name}</span>
            </div>
          )}

          {order?.shipping_methods && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">الشحن:</span>
              <span className="font-medium">
                {order.shipping_methods.name} ({order.shipping_methods.price} ₪)
              </span>
            </div>
          )}

          <div className="flex justify-between border-t pt-3">
            <span className="text-muted-foreground">المبلغ الإجمالي:</span>
            <span className="font-bold text-lg text-primary">{order?.price} ₪</span>
          </div>
        </div>

        {order?.payment_status === "paid" && (
          <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-green-700 dark:text-green-400 text-sm">
              شكراً لك! سيتم التواصل معك قريباً لتأكيد تفاصيل الشحن.
            </p>
          </div>
        )}

        {order?.payment_status === "failed" && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-red-700 dark:text-red-400 text-sm">
              لم يتم إتمام عملية الدفع. يرجى المحاولة مرة أخرى أو التواصل معنا.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PaymentStatus;
