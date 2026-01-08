import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingCart,
  Package,
  User,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  Loader2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  image_url: string | null;
  category_id: string | null;
}

interface CartItem extends Product {
  quantity: number;
}

interface Category {
  id: string;
  name: string;
}

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
}

const POS = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Customer info
  const [isWalkingCustomer, setIsWalkingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [selectedShipping, setSelectedShipping] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "paid">("cod");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();

      if (!workspace) return;

      const [productsRes, categoriesRes, shippingRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, stock, image_url, category_id')
          .eq('workspace_id', workspace.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('categories')
          .select('id, name')
          .eq('workspace_id', workspace.id)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('shipping_methods')
          .select('id, name, price')
          .eq('workspace_id', workspace.id)
          .eq('is_active', true)
      ]);

      if (productsRes.data) setProducts(productsRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (shippingRes.data) setShippingMethods(shippingRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (product.stock !== null && existing.quantity >= product.stock) {
          toast.error("الكمية المتوفرة غير كافية");
          return prev;
        }
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      if (product.stock !== null && product.stock <= 0) {
        toast.error("المنتج غير متوفر");
        return prev;
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === productId) {
          const newQuantity = item.quantity + delta;
          if (newQuantity <= 0) return item;
          if (item.stock !== null && newQuantity > item.stock) {
            toast.error("الكمية المتوفرة غير كافية");
            return item;
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = shippingMethods.find(s => s.id === selectedShipping)?.price || 0;
  const total = subtotal + shippingCost;

  const handleCheckout = async () => {
    if (!isWalkingCustomer && !customerName.trim()) {
      toast.error("يرجى إدخال اسم العميل");
      return;
    }

    const finalCustomerName = isWalkingCustomer ? "عميل عابر" : customerName;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();

      if (!workspace) throw new Error("Workspace not found");

      // Create order for each cart item
      for (const item of cart) {
        const { error } = await supabase
          .from('orders')
          .insert({
            workspace_id: workspace.id,
            customer_name: finalCustomerName,
            customer_phone: isWalkingCustomer ? null : (customerPhone || null),
            shipping_address: isWalkingCustomer ? null : (customerAddress || null),
            shipping_method_id: isWalkingCustomer ? null : (selectedShipping || null),
            product_id: item.id,
            price: item.price * item.quantity,
            payment_method: paymentMethod === "cod" ? "الدفع عند الاستلام" : "تم الدفع",
            payment_status: paymentMethod === "paid" ? "مدفوع" : "غير مدفوع",
            status: "قيد الانتظار",
            source_platform: "نقطة البيع",
            notes: `الكمية: ${item.quantity}`,
            order_number: ''
          });

        if (error) throw error;
      }

      toast.success("تم إنشاء الطلب بنجاح");
      setCart([]);
      setIsWalkingCustomer(false);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setSelectedShipping("");
      setPaymentMethod("cod");
      setCheckoutOpen(false);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error("حدث خطأ أثناء إنشاء الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4 p-4">
      {/* Products Section */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Search and Filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="جميع التصنيفات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع التصنيفات</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Products Grid */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map(product => (
              <Card
                key={product.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  <div className="aspect-square bg-muted rounded-md mb-2 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <h3 className="font-medium text-sm truncate">{product.name}</h3>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-primary font-bold">{product.price} ر.س</span>
                    {product.stock !== null && (
                      <Badge variant={product.stock > 0 ? "secondary" : "destructive"} className="text-xs">
                        {product.stock > 0 ? product.stock : "نفد"}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cart Section */}
      <Card className="w-96 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            السلة
            {cart.length > 0 && (
              <Badge variant="secondary">{cart.reduce((sum, item) => sum + item.quantity, 0)}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4 pt-0">
          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>السلة فارغة</p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 -mx-4 px-4">
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                      <div className="w-12 h-12 rounded bg-background flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-primary text-sm">{item.price * item.quantity} ر.س</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between text-lg font-bold">
                  <span>الإجمالي</span>
                  <span className="text-primary">{subtotal} ر.س</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setCheckoutOpen(true)}
                >
                  إتمام الطلب
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إتمام الطلب</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Walking Customer Checkbox */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Checkbox
                id="walking-customer"
                checked={isWalkingCustomer}
                onCheckedChange={(checked) => setIsWalkingCustomer(checked === true)}
              />
              <Label htmlFor="walking-customer" className="cursor-pointer flex-1">
                <span className="font-medium">عميل عابر</span>
                <p className="text-xs text-muted-foreground">بيع مباشر بدون بيانات عميل</p>
              </Label>
            </div>

            {!isWalkingCustomer && (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    اسم العميل *
                  </Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="أدخل اسم العميل"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    رقم الهاتف
                  </Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="أدخل رقم الهاتف"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    العنوان
                  </Label>
                  <Input
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="أدخل عنوان التوصيل"
                  />
                </div>

                {shippingMethods.length > 0 && (
                  <div className="space-y-2">
                    <Label>طريقة الشحن</Label>
                    <Select value={selectedShipping} onValueChange={setSelectedShipping}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طريقة الشحن" />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingMethods.map(method => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name} - {method.price} ر.س
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "cod" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("cod")}
                >
                  <Banknote className="w-4 h-4" />
                  عند الاستلام
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "paid" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("paid")}
                >
                  <CreditCard className="w-4 h-4" />
                  تم الدفع
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>المجموع الفرعي</span>
                <span>{subtotal} ر.س</span>
              </div>
              {shippingCost > 0 && (
                <div className="flex justify-between">
                  <span>الشحن</span>
                  <span>{shippingCost} ر.س</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2">
                <span>الإجمالي</span>
                <span className="text-primary">{total} ر.س</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري إنشاء الطلب...
                </>
              ) : (
                "تأكيد الطلب"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POS;
