import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Loader2, Download } from "lucide-react";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  price: number;
  payment_status: string;
  status: string;
  notes: string | null;
  created_at: string;
  products?: { name: string; price: number } | null;
  shipping_methods?: { name: string; price: number } | null;
}

const PaymentStatus = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
          .select("*, products(name, price), shipping_methods(name, price)")
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

  const handleDownloadPDF = async () => {
    if (!order) return;
    setDownloading(true);

    try {
      generateInvoicePDF({
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone || '',
        shipping_address: order.shipping_address || '',
        price: order.price,
        payment_status: order.payment_status,
        status: order.status,
        created_at: order.created_at,
        notes: order.notes || undefined,
        products: order.products,
        shipping_methods: order.shipping_methods,
      }, true);
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setDownloading(false);
    }
  };

  const getStatusIcon = () => {
    if (!order) return null;

    switch (order.payment_status) {
      case "paid":
        return <CheckCircle className="w-20 h-20 text-green-500" />;
      case "failed":
        return <XCircle className="w-20 h-20 text-red-500" />;
      case "cod":
        return <CheckCircle className="w-20 h-20 text-blue-500" />;
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
      case "cod":
        return "الدفع عند الاستلام";
      case "awaiting_payment":
      case "pending":
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
      case "cod":
        return "text-blue-600";
      default:
        return "text-yellow-600";
    }
  };

  // Parse notes to extract variants
  const parseNotes = () => {
    if (!order?.notes) return {};
    const lines = order.notes.split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const [key, value] = line.split(': ');
      if (key && value && !key.includes('تم الطلب')) {
        result[key.trim()] = value.trim();
      }
    }
    return result;
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

  const variants = parseNotes();

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

          {order?.customer_phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم الهاتف:</span>
              <span className="font-medium">{order.customer_phone}</span>
            </div>
          )}

          {order?.products?.name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">المنتج:</span>
              <span className="font-medium">{order.products.name}</span>
            </div>
          )}

          {/* Display variants from notes */}
          {Object.entries(variants).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}

          {order?.shipping_address && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">العنوان:</span>
              <span className="font-medium">{order.shipping_address}</span>
            </div>
          )}

          {order?.shipping_methods && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">الشحن:</span>
              <span className="font-medium">
                {order.shipping_methods.name} ({order.shipping_methods.price}₪)
              </span>
            </div>
          )}

          <div className="flex justify-between border-t pt-3">
            <span className="text-muted-foreground">المبلغ الإجمالي:</span>
            <span className="font-bold text-lg text-primary">{order?.price}₪</span>
          </div>
        </div>

        {order?.payment_status === "paid" && (
          <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-green-700 dark:text-green-400 text-sm">
              شكراً لك! سيتم التواصل معك قريباً لتأكيد تفاصيل الشحن.
            </p>
          </div>
        )}

        {order?.payment_status === "cod" && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-blue-700 dark:text-blue-400 text-sm">
              شكراً لك! سيتم التواصل معك قريباً لتأكيد الطلب والتوصيل.
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

        {/* Download PDF Button */}
        <Button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="mt-6 w-full"
          variant="outline"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 ml-2" />
          )}
          تحميل الفاتورة PDF
        </Button>
      </Card>
    </div>
  );
};

export default PaymentStatus;
