import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, User, Phone, Mail, Bot, Package, ShoppingCart, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import { getChannelIconComponent } from "@/components/ChannelIcons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Message {
  id: string;
  content: string;
  sender_type: string;
  created_at: string;
  sender_id?: string;
}

interface ChatViewProps {
  conversationId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAvatar?: string;
  channel: string;
  onClose?: () => void;
}

const ChatView = ({ 
  conversationId, 
  customerName, 
  customerPhone, 
  customerEmail,
  customerAvatar,
  channel 
}: ChatViewProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customer_name: customerName,
    customer_phone: customerPhone || '',
    customer_email: customerEmail || '',
    address: '',
    payment_method: '',
    product_id: '',
    quantity: 1,
    notes: ''
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    fetchProducts();

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('فشل تحميل الرسائل');
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      // Use unified send-channel-message function for ALL channels
      const { data: response, error: sendError } = await supabase.functions.invoke('send-channel-message', {
        body: {
          conversationId,
          message: newMessage.trim()
        }
      });

      if (sendError || !response?.success) {
        console.error(`Error sending message:`, sendError || response?.error);
        toast.error(response?.error || 'فشل إرسال الرسالة');
        setSending(false);
        return;
      }

      setNewMessage("");
      toast.success('تم إرسال الرسالة');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const handleSendProduct = async (product: any) => {
    try {
      const productMessage = `📦 *${product.name}*\n\n${product.description}\n\n💰 السعر: ${product.price} ريال`;
      
      // Send to channel FIRST to get message_id
      let platformMessageId = null;
      if ((channel === 'facebook' || channel === 'instagram') && customerPhone) {
        const functionName = channel === 'instagram' ? 'send-instagram-message' : 'send-facebook-message';
        const { data: platformResponse, error: sendError } = await supabase.functions.invoke(functionName, {
          body: {
            recipientId: customerPhone,
            message: productMessage
          }
        });

        if (sendError) {
          console.error(`Error sending to ${channel}:`, sendError);
          toast.error(`فشل إرسال المنتج إلى ${channel === 'instagram' ? 'إنستغرام' : 'فيسبوك'}`);
          return;
        }

        platformMessageId = platformResponse?.messageId;
      }

      // Save to database with message_id to prevent duplicate imports
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: productMessage,
          sender_type: 'employee',
          message_id: platformMessageId,
          is_old: false,
          reply_sent: true
        });

      if (error) throw error;

      setShowProductDialog(false);
      toast.success('تم إرسال المنتج للعميل');
    } catch (error) {
      console.error('Error sending product:', error);
      toast.error('فشل إرسال المنتج');
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orderForm.customer_name || !orderForm.customer_phone || !orderForm.address || !orderForm.payment_method) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (!orderForm.product_id) {
      toast.error('يرجى اختيار منتج');
      return;
    }

    try {
      const selectedProduct = products.find(p => p.id === orderForm.product_id);
      const totalPrice = selectedProduct ? selectedProduct.price * orderForm.quantity : 0;

      // Generate order number
      const { data: orderNumber } = await supabase.rpc('generate_order_number');

      const { error } = await supabase
        .from('orders')
        .insert({
          customer_name: orderForm.customer_name,
          customer_phone: orderForm.customer_phone,
          customer_email: orderForm.customer_email || null,
          product_id: orderForm.product_id,
          price: totalPrice,
          order_number: orderNumber || `ORD-${Date.now()}`,
          status: 'قيد الانتظار',
          conversation_id: conversationId,
          source_platform: channel,
          created_by: 'employee',
          notes: `العنوان: ${orderForm.address}\nطريقة الدفع: ${orderForm.payment_method}${orderForm.notes ? `\n${orderForm.notes}` : ''}`
        });

      if (error) throw error;

      setShowOrderForm(false);
      setOrderForm({
        customer_name: customerName,
        customer_phone: customerPhone || '',
        customer_email: customerEmail || '',
        address: '',
        payment_method: '',
        product_id: '',
        quantity: 1,
        notes: ''
      });
      toast.success('تم إنشاء الطلب بنجاح');
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('فشل إنشاء الطلب');
    }
  };

  const getChannelIcon = () => {
    return getChannelIconComponent(channel, "w-4 h-4");
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={customerAvatar} alt={customerName} />
              <AvatarFallback>
                <User className="w-5 h-5 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{customerName}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {getChannelIcon()}
                <span>{customerPhone || customerEmail}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Package className="w-4 h-4 ml-1" />
                  إرسال منتج
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>اختر منتج لإرساله للعميل</DialogTitle>
                  <DialogDescription>
                    اختر المنتج الذي تريد إرساله في المحادثة
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {products.map((product) => (
                    <Card 
                      key={product.id} 
                      className="p-4 cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleSendProduct(product)}
                    >
                      {product.image_url && (
                        <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover rounded-md mb-2" />
                      )}
                      <h4 className="font-semibold">{product.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                      <p className="text-primary font-bold mt-2">{product.price} ريال</p>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowOrderForm(!showOrderForm)}
            >
              {showOrderForm ? <X className="w-4 h-4 ml-1" /> : <ShoppingCart className="w-4 h-4 ml-1" />}
              {showOrderForm ? 'إلغاء' : 'إنشاء طلب'}
            </Button>

            {customerPhone && (
              <Button variant="ghost" size="sm">
                <Phone className="w-4 h-4" />
              </Button>
            )}
            {customerEmail && (
              <Button variant="ghost" size="sm">
                <Mail className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Order Form */}
      {showOrderForm && (
        <div className="p-4 border-b bg-muted/20">
          <h3 className="font-semibold text-lg mb-4">إنشاء طلب جديد</h3>
          <form onSubmit={handleCreateOrder} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order_customer_name">اسم العميل *</Label>
                <Input
                  id="order_customer_name"
                  value={orderForm.customer_name}
                  onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                  placeholder="أدخل اسم العميل"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_customer_phone">رقم الهاتف *</Label>
                <Input
                  id="order_customer_phone"
                  value={orderForm.customer_phone}
                  onChange={(e) => setOrderForm({ ...orderForm, customer_phone: e.target.value })}
                  placeholder="أدخل رقم الهاتف"
                  required
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label htmlFor="order_address">العنوان *</Label>
                <Textarea
                  id="order_address"
                  value={orderForm.address}
                  onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })}
                  placeholder="أدخل العنوان الكامل"
                  required
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_product">المنتج *</Label>
                <Select
                  value={orderForm.product_id}
                  onValueChange={(value) => setOrderForm({ ...orderForm, product_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر منتج" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.price} ريال
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_payment">طريقة الدفع *</Label>
                <Select
                  value={orderForm.payment_method}
                  onValueChange={(value) => setOrderForm({ ...orderForm, payment_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نقدي">نقدي</SelectItem>
                    <SelectItem value="بطاقة ائتمان">بطاقة ائتمان</SelectItem>
                    <SelectItem value="تحويل بنكي">تحويل بنكي</SelectItem>
                    <SelectItem value="محفظة إلكترونية">محفظة إلكترونية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_quantity">الكمية</Label>
                <Input
                  id="order_quantity"
                  type="number"
                  min="1"
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label htmlFor="order_notes">ملاحظات إضافية</Label>
                <Textarea
                  id="order_notes"
                  value={orderForm.notes}
                  onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                  placeholder="أضف أي ملاحظات إضافية"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowOrderForm(false)}>
                إلغاء
              </Button>
              <Button type="submit">
                إنشاء الطلب
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 max-h-[400px]" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              لا توجد رسائل بعد
            </div>
          ) : (
            messages.map((message) => {
              const isFromEmployee = message.sender_type === 'employee' || message.sender_type === 'agent';
              return (
              <div
                key={message.id}
                className={`flex ${isFromEmployee ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    isFromEmployee
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    isFromEmployee
                      ? 'text-primary-foreground/70' 
                      : 'text-muted-foreground'
                  }`}>
                    {formatDistanceToNow(new Date(message.created_at), { 
                      addSuffix: true,
                      locale: ar 
                    })}
                  </p>
                </div>
              </div>
            )})
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Textarea
            placeholder="اكتب رسالتك..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="min-h-[60px] resize-none"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!newMessage.trim() || sending}
            size="lg"
            className="px-6"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          اضغط Enter للإرسال، Shift+Enter لسطر جديد
        </p>
      </div>
    </Card>
  );
};

export default ChatView;
