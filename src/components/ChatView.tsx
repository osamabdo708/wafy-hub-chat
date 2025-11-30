import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, User, Phone, Mail, Bot, Package, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import facebookIcon from "@/assets/facebook.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
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
      // Get current conversation to check thread_id
      const { data: conversation } = await supabase
        .from('conversations')
        .select('thread_id, platform')
        .eq('id', conversationId)
        .single();

      // Insert message to database (using existing conversation)
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: newMessage.trim(),
          sender_type: 'employee'
        });

      if (error) throw error;

      // Send message to Facebook using existing thread_id
      if (channel === 'facebook' && conversation?.thread_id) {
        const { error: sendError } = await supabase.functions.invoke('send-facebook-message', {
          body: {
            recipientId: customerPhone,
            message: newMessage.trim()
          }
        });

        if (sendError) {
          console.error('Error sending to Facebook:', sendError);
          toast.error('تم حفظ الرسالة لكن فشل إرسالها إلى فيسبوك');
          setSending(false);
          return;
        }
      }

      // Update conversation's last_message_at (do NOT create new conversation)
      await supabase
        .from('conversations')
        .update({ 
          last_message_at: new Date().toISOString(),
          status: 'مفتوح'
        })
        .eq('id', conversationId);

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
      
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: productMessage,
          sender_type: 'employee'
        });

      if (error) throw error;

      // Send to channel if needed
      if (channel === 'facebook' && customerPhone) {
        await supabase.functions.invoke('send-facebook-message', {
          body: {
            recipientId: customerPhone,
            message: productMessage
          }
        });
      }

      setShowProductDialog(false);
      toast.success('تم إرسال المنتج للعميل');
    } catch (error) {
      console.error('Error sending product:', error);
      toast.error('فشل إرسال المنتج');
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedProduct) {
      toast.error('يرجى اختيار منتج');
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone || '',
          product_id: selectedProduct.id,
          price: selectedProduct.price * orderQuantity,
          status: 'قيد الانتظار',
          conversation_id: conversationId,
          source_platform: channel,
          created_by: 'employee',
          order_number: `ORD-${Date.now()}`
        });

      if (error) throw error;

      setShowOrderDialog(false);
      setSelectedProduct(null);
      setOrderQuantity(1);
      toast.success('تم إنشاء الطلب بنجاح');
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('فشل إنشاء الطلب');
    }
  };

  const getChannelIcon = () => {
    if (channel === 'facebook') {
      return <img src={facebookIcon} alt="Facebook" className="w-4 h-4" />;
    }
    return null;
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

            <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <ShoppingCart className="w-4 h-4 ml-1" />
                  إنشاء طلب
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء طلب جديد</DialogTitle>
                  <DialogDescription>
                    أنشئ طلباً من هذه المحادثة
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>اختر المنتج</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded-md"
                      value={selectedProduct?.id || ''}
                      onChange={(e) => {
                        const product = products.find(p => p.id === e.target.value);
                        setSelectedProduct(product);
                      }}
                    >
                      <option value="">-- اختر منتج --</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {product.price} ريال
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      min="1"
                      value={orderQuantity}
                      onChange={(e) => setOrderQuantity(parseInt(e.target.value) || 1)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>اسم العميل</Label>
                    <Input value={customerName} disabled className="mt-1" />
                  </div>

                  <div>
                    <Label>رقم الهاتف</Label>
                    <Input value={customerPhone || ''} disabled className="mt-1" />
                  </div>

                  {selectedProduct && (
                    <div className="bg-muted p-3 rounded-md">
                      <p className="text-sm font-semibold">الإجمالي</p>
                      <p className="text-2xl font-bold text-primary">
                        {(selectedProduct.price * orderQuantity).toFixed(2)} ريال
                      </p>
                    </div>
                  )}

                  <Button onClick={handleCreateOrder} className="w-full" disabled={!selectedProduct}>
                    إنشاء الطلب
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

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

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
