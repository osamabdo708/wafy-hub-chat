import { useState } from 'react';
import { Loader2, CheckCircle2, ShoppingBag, User, Phone, MapPin, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CartItem } from '@/hooks/useStoreCart';

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
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone) {
      toast.error('يرجى إدخال الاسم ورقم الهاتف');
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

      // Create order for each product (or combine into one)
      const firstProduct = cart[0];
      
      const { error } = await supabase
        .from('orders')
        .insert({
          order_number: generatedOrderNumber,
          customer_name: formData.name,
          customer_phone: formData.phone,
          shipping_address: formData.address || null,
          notes: `${formData.notes ? formData.notes + '\n\n' : ''}تفاصيل الطلب:\n${orderDetails}`,
          price: totalPrice,
          product_id: firstProduct?.productId || null,
          workspace_id: storeId,
          source_platform: 'المتجر',
          status: 'قيد الانتظار',
          payment_status: 'pending',
        });

      if (error) throw error;

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
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
              <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                {cart.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {item.name} × {item.quantity}
                    </span>
                    <span>{item.price * item.quantity} ₪</span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-3 pt-3 flex justify-between font-bold">
                <span>المجموع</span>
                <span className="text-primary">{totalPrice} ₪</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              <Button type="submit" size="lg" className="w-full h-12" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin ml-2" />
                    جاري إرسال الطلب...
                  </>
                ) : (
                  'تأكيد الطلب'
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
