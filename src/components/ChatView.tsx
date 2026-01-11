import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, User, Phone, Mail, Bot, Package, ShoppingCart, X, LinkIcon, Loader2, Play, Pause, Volume2, Image, Video, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { generateInvoicePDF } from "@/utils/invoiceGenerator";
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

// Helper to detect media type from URL
const getMediaType = (content: string): 'image' | 'video' | 'audio' | 'text' => {
  if (!content || !content.startsWith('http')) return 'text';
  
  const lowerContent = content.toLowerCase();
  
  // Audio detection (voice messages)
  if (
    lowerContent.includes('audio') ||
    lowerContent.includes('voice') ||
    /\.(mp3|ogg|wav|m4a|aac|opus)(\?|$)/i.test(content)
  ) {
    return 'audio';
  }
  
  // Video detection
  if (
    lowerContent.includes('video') ||
    /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(content)
  ) {
    return 'video';
  }
  
  // Image detection (Instagram/Facebook CDN or common image formats)
  if (
    lowerContent.includes('lookaside.fbsbx.com') ||
    lowerContent.includes('scontent') ||
    lowerContent.includes('cdninstagram.com') ||
    lowerContent.includes('fbcdn.net') ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(content)
  ) {
    return 'image';
  }
  
  // Check if it's a CDN URL that might be media
  if (
    lowerContent.includes('lookaside.fbsbx.com') ||
    lowerContent.includes('ig_messaging_cdn')
  ) {
    // Default to image for Instagram/Facebook CDN if not explicitly audio/video
    return 'image';
  }
  
  return 'text';
};

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
  const [orders, setOrders] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<any[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showPaymentLinkDialog, setShowPaymentLinkDialog] = useState(false);
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<string>("");
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customer_name: customerName,
    customer_phone: customerPhone || '',
    customer_email: customerEmail || '',
    address: '',
    payment_method: '',
    product_id: '',
    shipping_method_id: '',
    quantity: 1,
    notes: ''
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Media lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio' } | null>(null);

  useEffect(() => {
    fetchMessages();
    fetchProducts();
    fetchOrders();
    fetchWorkspaceId();
    fetchShippingMethods();

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

  const fetchWorkspaceId = async () => {
    try {
      // Get workspace_id from conversation
      const { data, error } = await supabase
        .from('conversations')
        .select('workspace_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (error) throw error;
      if (data?.workspace_id) {
        setWorkspaceId(data.workspace_id);
      }
    } catch (error) {
      console.error('Error fetching workspace_id:', error);
    }
  };

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

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, shipping_methods(name, price)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchShippingMethods = async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_methods')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setShippingMethods(data || []);
    } catch (error) {
      console.error('Error fetching shipping methods:', error);
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
      const productMessage = `📦 *${product.name}*\n\n${product.description}\n\n💰 السعر: ${product.price} ₪`;
      
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

    if (!orderForm.shipping_method_id) {
      toast.error('يرجى اختيار طريقة الشحن');
      return;
    }

    try {
      if (!workspaceId) {
        toast.error('لم يتم العثور على بيانات المحادثة');
        return;
      }

      const selectedProduct = products.find(p => p.id === orderForm.product_id);
      const selectedShipping = shippingMethods.find(s => s.id === orderForm.shipping_method_id);
      const productTotal = selectedProduct ? selectedProduct.price * orderForm.quantity : 0;
      const shippingPrice = selectedShipping ? Number(selectedShipping.price) : 0;
      const totalPrice = productTotal + shippingPrice;

      // Generate order number
      const { data: orderNumber } = await supabase.rpc('generate_order_number');
      const finalOrderNumber = orderNumber || `ORD-${Date.now()}`;

      const { error } = await supabase
        .from('orders')
        .insert({
          customer_name: orderForm.customer_name,
          customer_phone: orderForm.customer_phone,
          customer_email: orderForm.customer_email || null,
          product_id: orderForm.product_id,
          shipping_method_id: orderForm.shipping_method_id,
          price: totalPrice,
          order_number: finalOrderNumber,
          status: 'قيد الانتظار',
          conversation_id: conversationId,
          workspace_id: workspaceId,
          source_platform: channel,
          created_by: 'employee',
          shipping_address: orderForm.address,
          payment_status: orderForm.payment_method === 'نقدي' ? 'pending' : 'awaiting_payment',
          notes: `طريقة الدفع: ${orderForm.payment_method}\nطريقة الشحن: ${selectedShipping?.name || 'غير محدد'}${orderForm.notes ? `\n${orderForm.notes}` : ''}`
        });

      if (error) throw error;

      // Decrement product stock
      if (selectedProduct && selectedProduct.stock !== null) {
        const newStock = Math.max(0, selectedProduct.stock - orderForm.quantity);
        await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', orderForm.product_id);
        
        // Update local products state
        setProducts(prev => prev.map(p => 
          p.id === orderForm.product_id ? { ...p, stock: newStock } : p
        ));
      }

      // Generate invoice PDF and get the URL
      const invoiceUrl = generateInvoicePDF({
        order_number: finalOrderNumber,
        customer_name: orderForm.customer_name,
        customer_phone: orderForm.customer_phone,
        customer_email: orderForm.customer_email,
        shipping_address: orderForm.address,
        price: totalPrice,
        payment_status: orderForm.payment_method === 'نقدي' ? 'pending' : 'awaiting_payment',
        status: 'قيد الانتظار',
        created_at: new Date().toISOString(),
        notes: `طريقة الدفع: ${orderForm.payment_method}`,
        products: selectedProduct ? { name: selectedProduct.name } : null,
        shipping_methods: selectedShipping ? { name: selectedShipping.name, price: shippingPrice } : null
      }, false);

      // Send order confirmation message with invoice URL
      const orderMessage = `✅ تم إنشاء طلبك بنجاح!\n\n📋 رقم الطلب: #${finalOrderNumber}\n📦 المنتج: ${selectedProduct?.name || 'غير محدد'}\n💰 الإجمالي: ${totalPrice} ₪\n\n🧾 رابط الفاتورة:\n${invoiceUrl}`;

      try {
        const { data: sendResponse, error: sendError } = await supabase.functions.invoke(
          'send-channel-message',
          {
            body: {
              conversationId,
              message: orderMessage,
            },
          }
        );

        if (sendError || !sendResponse?.success) {
          console.warn(
            'Could not send order message to channel (API restriction):',
            sendError || sendResponse?.error
          );

          // Save message locally even if sending failed
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: orderMessage,
            sender_type: 'employee',
            is_old: false,
            reply_sent: false,
          });

          const channelName =
            channel === 'instagram'
              ? 'إنستغرام'
              : channel === 'facebook'
                ? 'فيسبوك'
                : 'القناة';

          toast.warning(
            `تم إنشاء الطلب، لكن تعذر إرسال رسالة التأكيد تلقائياً عبر ${channelName} بسبب قيود المنصة. يمكنك نسخ الرابط وإرساله يدوياً للعميل.`
          );
        }
      } catch (sendErr) {
        console.warn('Could not send order message to channel:', sendErr);

        // Save message locally even if sending failed
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          content: orderMessage,
          sender_type: 'employee',
          is_old: false,
          reply_sent: false,
        });
      }

      setShowOrderForm(false);
      setOrderForm({
        customer_name: customerName,
        customer_phone: customerPhone || '',
        customer_email: customerEmail || '',
        address: '',
        payment_method: '',
        product_id: '',
        shipping_method_id: '',
        quantity: 1,
        notes: ''
      });
      toast.success('تم إنشاء الطلب بنجاح');
      fetchOrders(); // Refresh orders list
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('فشل إنشاء الطلب');
    }
  };

  const getChannelIcon = () => {
    return getChannelIconComponent(channel, "w-4 h-4");
  };

  const handleGeneratePaymentLink = async () => {
    if (!selectedOrderForPayment) {
      toast.error('يرجى اختيار طلب');
      return;
    }

    setGeneratingPaymentLink(true);
    try {
      const order = orders.find(o => o.id === selectedOrderForPayment);
      if (!order) {
        toast.error('الطلب غير موجود');
        return;
      }

      if (order.payment_link) {
        toast.error('تم إنشاء رابط دفع لهذا الطلب مسبقاً');
        return;
      }

      // Call PayTabs edge function to create real payment link
      const { data: response, error: functionError } = await supabase.functions.invoke('create-paytabs-payment', {
        body: { orderId: selectedOrderForPayment }
      });

      if (functionError || !response?.success) {
        console.error('PayTabs error:', functionError || response?.error);
        toast.error(response?.error || 'فشل إنشاء رابط الدفع');
        return;
      }

      const paymentLink = response.payment_url;

      // Send payment link in chat
      const shippingInfo = order.shipping_methods ? `\n📦 الشحن: ${order.shipping_methods.name} (${order.shipping_methods.price} ₪)` : '';
      const paymentMessage = `🔗 رابط الدفع للطلب #${order.order_number}\n\n💰 المبلغ الإجمالي: ${order.price} ₪${shippingInfo}\n\n${paymentLink}`;
      
      // Try to send to channel, but don't fail if it doesn't work (Instagram/Facebook may block links)
      try {
        const { data: sendResponse, error: sendError } = await supabase.functions.invoke('send-channel-message', {
          body: {
            conversationId,
            message: paymentMessage
          }
        });

        if (sendError || !sendResponse?.success) {
          console.warn('Could not send payment link to channel (API restriction):', sendError || sendResponse?.error);
          // Save message locally even if sending failed
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: paymentMessage,
            sender_type: 'employee',
            is_old: false,
            reply_sent: false
          });
          
          // Copy link to clipboard
          await navigator.clipboard.writeText(paymentLink);
          
          const channelName = channel === 'instagram' ? 'إنستغرام' : channel === 'facebook' ? 'فيسبوك' : 'القناة';
          toast.warning(`تم إنشاء رابط الدفع ونسخه للحافظة. ${channelName} لا يسمح بإرسال الروابط تلقائياً - يرجى لصق الرابط وإرساله يدوياً للعميل.`);
        } else {
          toast.success('تم إرسال رابط الدفع للعميل');
        }
      } catch (sendErr) {
        console.warn('Error sending to channel:', sendErr);
        // Save message locally
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          content: paymentMessage,
          sender_type: 'employee',
          is_old: false,
          reply_sent: false
        });
        
        // Copy link to clipboard
        await navigator.clipboard.writeText(paymentLink);
        
        const channelName = channel === 'instagram' ? 'إنستغرام' : channel === 'facebook' ? 'فيسبوك' : 'القناة';
        toast.warning(`تم إنشاء رابط الدفع ونسخه للحافظة. ${channelName} لا يسمح بإرسال الروابط تلقائياً - يرجى لصق الرابط وإرساله يدوياً للعميل.`);
      }

      setShowPaymentLinkDialog(false);
      setSelectedOrderForPayment("");
      fetchOrders();
    } catch (error) {
      console.error('Error generating payment link:', error);
      toast.error('فشل إنشاء رابط الدفع');
    } finally {
      setGeneratingPaymentLink(false);
    }
  };


  const payableOrders = orders.filter((o) => !o.payment_link && o.payment_method !== 'نقدي');

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
                      <p className="text-primary font-bold mt-2">{product.price} ₪</p>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showPaymentLinkDialog} onOpenChange={setShowPaymentLinkDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <LinkIcon className="w-4 h-4 ml-1" />
                  رابط دفع
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء رابط دفع</DialogTitle>
                  <DialogDescription>
                    اختر الطلب لإرسال رابط الدفع للعميل
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {payableOrders.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      لا توجد طلبات بدون رابط دفع لهذه المحادثة
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <Label>اختر الطلب</Label>
                      <Select value={selectedOrderForPayment} onValueChange={setSelectedOrderForPayment}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر طلب" />
                        </SelectTrigger>
                        <SelectContent>
                          {payableOrders.map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                              {order.order_number} - {order.price} ₪
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowPaymentLinkDialog(false)}>
                    إلغاء
                  </Button>
                  <Button 
                    onClick={handleGeneratePaymentLink} 
                    disabled={!selectedOrderForPayment || generatingPaymentLink}
                  >
                    {generatingPaymentLink && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                    إرسال رابط الدفع
                  </Button>
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
                        {product.name} - {product.price} ₪
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_shipping">طريقة الشحن *</Label>
                <Select
                  value={orderForm.shipping_method_id}
                  onValueChange={(value) => setOrderForm({ ...orderForm, shipping_method_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الشحن" />
                  </SelectTrigger>
                  <SelectContent>
                    {shippingMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {method.name} - {method.price} ₪
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
                    <SelectItem value="نقدي">نقدي (الدفع عند الاستلام)</SelectItem>
                    <SelectItem value="رابط دفع PayTabs">رابط دفع PayTabs</SelectItem>
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

      {/* Media Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>عرض الوسائط</DialogTitle>
          </DialogHeader>
          {lightboxMedia && (
            <div className="flex items-center justify-center min-h-[300px]">
              {lightboxMedia.type === 'image' && (
                <img 
                  src={lightboxMedia.url} 
                  alt="صورة مكبرة" 
                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                />
              )}
              {lightboxMedia.type === 'video' && (
                <video 
                  src={lightboxMedia.url} 
                  controls 
                  autoPlay
                  className="max-w-full max-h-[80vh] rounded-lg"
                >
                  <source src={lightboxMedia.url} type="video/mp4" />
                  المتصفح لا يدعم تشغيل الفيديو
                </video>
              )}
              {lightboxMedia.type === 'audio' && (
                <div className="flex flex-col items-center gap-4 p-8">
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mic className="w-12 h-12 text-primary" />
                  </div>
                  <audio 
                    src={lightboxMedia.url} 
                    controls 
                    autoPlay
                    className="w-full max-w-md"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              const mediaType = getMediaType(message.content);
              
              const openLightbox = (url: string, type: 'image' | 'video' | 'audio') => {
                setLightboxMedia({ url, type });
                setLightboxOpen(true);
              };
              
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
                  {mediaType === 'image' && (
                    <div className="space-y-2">
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => openLightbox(message.content, 'image')}
                      >
                        <img 
                          src={message.content} 
                          alt="صورة مرسلة" 
                          className="max-w-full rounded-lg max-h-48 object-cover hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling;
                            if (fallback) fallback.classList.remove('hidden');
                          }}
                        />
                        <a 
                          href={message.content} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hidden text-blue-500 underline text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔗 فتح الصورة
                        </a>
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <Image className="w-8 h-8 text-white" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {mediaType === 'video' && (
                    <div className="space-y-2">
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => openLightbox(message.content, 'video')}
                      >
                        <video 
                          src={message.content}
                          className="max-w-full rounded-lg max-h-48 object-cover"
                          preload="metadata"
                          muted
                        />
                        <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                            <Play className="w-6 h-6 text-primary ml-1" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {mediaType === 'audio' && (
                    <div className="space-y-2">
                      <div 
                        className="flex items-center gap-3 p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-background/70 transition-colors min-w-[200px]"
                        onClick={() => openLightbox(message.content, 'audio')}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <Mic className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">رسالة صوتية</p>
                          <p className="text-xs text-muted-foreground">اضغط للاستماع</p>
                        </div>
                        <Play className="w-5 h-5 text-primary" />
                      </div>
                      <audio 
                        src={message.content}
                        controls
                        className="w-full max-w-[250px]"
                        preload="metadata"
                      />
                    </div>
                  )}
                  
                  {mediaType === 'text' && (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                  
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
