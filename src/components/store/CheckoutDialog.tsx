import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, ShoppingBag, User, Phone, MapPin, FileText, Truck, CreditCard, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CartItem } from '@/hooks/useStoreCart';

interface ShippingMethod {
  id: string;
  name: string;
  description: string | null;
  price: number;
  estimated_days: number | null;
}

interface PaymentSettings {
  cod_enabled: boolean;
  paytabs_enabled: boolean;
}

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  totalPrice: number;
  storeId: string;
  storeName: string;
  onSuccess: () => void;
}

export const CheckoutDialog = ({
  open,
  onOpenChange,
  cart,
  totalPrice,
  storeId,
  storeName,
  onSuccess,
}: CheckoutDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<string>('');
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  useEffect(() => {
    if (open && storeId) {
      fetchShippingMethods();
      fetchPaymentSettings();
    }
  }, [open, storeId]);

  const fetchShippingMethods = async () => {
    const { data, error } = await supabase
      .from('shipping_methods')
      .select('id, name, description, price, estimated_days')
      .eq('workspace_id', storeId)
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (!error && data) {
      setShippingMethods(data);
      if (data.length > 0) {
        setSelectedShipping(data[0].id);
      }
    }
  };

  const fetchPaymentSettings = async () => {
    const { data, error } = await supabase
      .from('payment_settings')
      .select('cod_enabled, paytabs_enabled')
      .eq('workspace_id', storeId)
      .single();

    if (!error && data) {
      setPaymentSettings(data);
      // Default to COD if enabled, otherwise PayTabs
      if (data.cod_enabled) {
        setSelectedPayment('cod');
      } else if (data.paytabs_enabled) {
        setSelectedPayment('paytabs');
      }
    }
  };

  const getShippingPrice = () => {
    const method = shippingMethods.find(m => m.id === selectedShipping);
    return method?.price || 0;
  };

  const getFinalTotal = () => {
    return totalPrice + getShippingPrice();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone) {
      toast.error('يرجى إدخال الاسم ورقم الهاتف');
      return;
    }

    if (!selectedShipping) {
      toast.error('يرجى اختيار طريقة الشحن');
      return;
    }

    if (!selectedPayment) {
      toast.error('يرجى اختيار طريقة الدفع');
      return;
    }

    setLoading(true);

    try {
      // Generate order number
      const { data: orderNumData } = await supabase.rpc('generate_order_number');
      const generatedOrderNumber = orderNumData || `ORD-${Date.now()}`;

      // Build order details
      const orderDetails = cart.map(item => {
        let details = `${item.name} (${item.quantity}x)`;
        if (item.selectedColor) details += ` - اللون: ${item.selectedColor}`;
        if (item.selectedAttributes) {
          Object.entries(item.selectedAttributes).forEach(([key, value]) => {
            details += ` - ${key}: ${value}`;
          });
        }
        return details;
      }).join('\n');

      const shippingMethod = shippingMethods.find(m => m.id === selectedShipping);
      const paymentMethod = selectedPayment === 'cod' ? 'الدفع عند الاستلام' : 'دفع إلكتروني';

      // Create order
      const firstProduct = cart[0];
      
      const { data: orderData, error } = await supabase
        .from('orders')
        .insert({
          order_number: generatedOrderNumber,
          customer_name: formData.name,
          customer_phone: formData.phone,
          shipping_address: formData.address || null,
          shipping_method_id: selectedShipping,
          payment_method: paymentMethod,
          notes: `${formData.notes ? formData.notes + '\n\n' : ''}تفاصيل الطلب:\n${orderDetails}\n\nطريقة الشحن: ${shippingMethod?.name || 'غير محدد'}\nتكلفة الشحن: ${getShippingPrice()} ₪`,
          price: getFinalTotal(),
          product_id: firstProduct?.productId || null,
          workspace_id: storeId,
          source_platform: 'المتجر',
          status: 'قيد الانتظار',
          payment_status: selectedPayment === 'cod' ? 'pending' : 'awaiting_payment',
        })
        .select('id')
        .single();

      if (error) throw error;

      // If electronic payment selected, create PayTabs payment
      if (selectedPayment === 'paytabs' && orderData) {
        const { data: paymentData, error: paymentError } = await supabase.functions.invoke('create-paytabs-payment', {
          body: { orderId: orderData.id }
        });

        if (paymentError || !paymentData?.payment_url) {
          console.error('PayTabs error:', paymentError || paymentData);
          toast.error('حدث خطأ في إنشاء رابط الدفع، يرجى المحاولة مرة أخرى');
          // Delete the order if payment creation failed
          await supabase.from('orders').delete().eq('id', orderData.id);
          setLoading(false);
          return;
        }

        // Redirect to PayTabs payment page
        window.location.href = paymentData.payment_url;
        return;
      }

      setOrderNumber(generatedOrderNumber);
      setSuccess(true);
      onSuccess();
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('حدث خطأ أثناء إنشاء الطلب');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (success) {
      setSuccess(false);
      setFormData({ name: '', phone: '', address: '', notes: '' });
    }
    onOpenChange(false);
  };

  const hasPaymentOptions = paymentSettings?.cod_enabled || paymentSettings?.paytabs_enabled;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {success ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">تم إرسال طلبك بنجاح!</h2>
            <p className="text-muted-foreground mb-4">رقم الطلب: {orderNumber}</p>
            <p className="text-sm text-muted-foreground mb-6">
              سيتم التواصل معك قريباً لتأكيد الطلب
            </p>
            <Button onClick={handleClose} className="w-full">
              إغلاق
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                إتمام الطلب
              </DialogTitle>
            </DialogHeader>

            {/* Order Summary */}
            <div className="bg-muted/50 rounded-xl p-4 mb-4">
              <h4 className="font-semibold mb-2">ملخص الطلب</h4>
              <div className="space-y-1 text-sm max-h-24 overflow-y-auto">
                {cart.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {item.name} × {item.quantity}
                    </span>
                    <span>{item.price * item.quantity} ₪</span>
                  </div>
                ))}
              </div>
              {selectedShipping && (
                <div className="flex justify-between text-sm border-t mt-2 pt-2">
                  <span className="text-muted-foreground">الشحن</span>
                  <span>{getShippingPrice()} ₪</span>
                </div>
              )}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>المجموع</span>
                <span className="text-primary">{getFinalTotal()} ₪</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Info */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    الاسم الكامل *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="أدخل اسمك الكامل"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    رقم الهاتف *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="05xxxxxxxx"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    عنوان التوصيل
                  </Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="المدينة، الشارع، رقم المبنى"
                  />
                </div>
              </div>

              {/* Shipping Methods */}
              {shippingMethods.length > 0 && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    طريقة الشحن *
                  </Label>
                  <RadioGroup value={selectedShipping} onValueChange={setSelectedShipping} className="space-y-2">
                    {shippingMethods.map((method) => (
                      <label
                        key={method.id}
                        htmlFor={`shipping-${method.id}`}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedShipping === method.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value={method.id} id={`shipping-${method.id}`} />
                        <div className="flex-1">
                          <span className="font-medium">
                            {method.name}
                          </span>
                          {method.description && (
                            <p className="text-xs text-muted-foreground">{method.description}</p>
                          )}
                          {method.estimated_days && (
                            <p className="text-xs text-muted-foreground">
                              التوصيل خلال {method.estimated_days} أيام
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-primary">
                          {method.price === 0 ? 'مجاني' : `${method.price} ₪`}
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {/* Payment Methods */}
              {hasPaymentOptions && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    طريقة الدفع *
                  </Label>
                  <RadioGroup value={selectedPayment} onValueChange={setSelectedPayment} className="space-y-2">
                    {paymentSettings?.cod_enabled && (
                      <label
                        htmlFor="payment-cod"
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPayment === 'cod' 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value="cod" id="payment-cod" />
                        <Banknote className="w-5 h-5 text-muted-foreground" />
                        <div className="flex-1">
                          <span className="font-medium">
                            الدفع عند الاستلام
                          </span>
                          <p className="text-xs text-muted-foreground">
                            ادفع نقداً عند استلام طلبك
                          </p>
                        </div>
                      </label>
                    )}
                    {paymentSettings?.paytabs_enabled && (
                      <label
                        htmlFor="payment-paytabs"
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPayment === 'paytabs' 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value="paytabs" id="payment-paytabs" />
                        <CreditCard className="w-5 h-5 text-muted-foreground" />
                        <div className="flex-1">
                          <span className="font-medium">
                            دفع إلكتروني
                          </span>
                          <p className="text-xs text-muted-foreground">
                            ادفع باستخدام بطاقة الائتمان أو الخصم
                          </p>
                        </div>
                      </label>
                    )}
                  </RadioGroup>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  ملاحظات إضافية
                </Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="أي ملاحظات أو تعليمات خاصة..."
                  rows={2}
                />
              </div>

              <Button 
                type="submit" 
                size="lg" 
                className="w-full h-12" 
                disabled={loading || (shippingMethods.length > 0 && !selectedShipping) || !selectedPayment}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin ml-2" />
                    {selectedPayment === 'paytabs' ? 'جاري التحويل للدفع...' : 'جاري إرسال الطلب...'}
                  </>
                ) : (
                  selectedPayment === 'paytabs' ? `الدفع الآن - ${getFinalTotal()} ₪` : 'تأكيد الطلب'
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
