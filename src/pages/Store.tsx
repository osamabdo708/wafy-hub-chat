import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Phone, 
  Mail, 
  MapPin,
  Package,
  Loader2,
  Store as StoreIcon,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { useStoreCart } from "@/hooks/useStoreCart";
import { CategorySlider } from "@/components/store/CategorySlider";
import { ProductCard } from "@/components/store/ProductCard";
import { CartSheet } from "@/components/store/CartSheet";
import { CheckoutDialog } from "@/components/store/CheckoutDialog";

interface StoreData {
  id: string;
  name: string;
  store_slug: string;
  store_logo_url?: string;
  store_banner_url?: string;
  store_description?: string;
  store_phone?: string;
  store_email?: string;
  store_address?: string;
  social_links?: Record<string, string>;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_id?: string;
  stock: number;
  image_url?: string;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
}

const Store = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const { 
    cart, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    clearCart, 
    getTotalItems, 
    getTotalPrice 
  } = useStoreCart(store?.id || '');

  useEffect(() => {
    if (storeSlug) {
      fetchStoreData();
    }
  }, [storeSlug]);

  const fetchStoreData = async () => {
    try {
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('store_slug', storeSlug)
        .eq('store_enabled', true)
        .single();

      if (workspaceError || !workspaceData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setStore(workspaceData as unknown as StoreData);

      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceData.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      setProducts(productsData || []);

      const { data: categoriesData } = await supabase
        .from('categories')
        .select('*')
        .eq('workspace_id', workspaceData.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Error fetching store:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = !selectedCategory || product.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleViewProduct = (product: Product) => {
    navigate(`/store/${storeSlug}/product/${product.id}`);
  };

  const handleAddToCart = (product: Product) => {
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.image_url,
    });
    toast.success('تمت الإضافة للسلة');
  };

  const handleBuyNow = (product: Product) => {
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.image_url,
    });
    setCheckoutOpen(true);
  };

  const handleCheckout = () => {
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const handleCheckoutSuccess = () => {
    clearCart();
    setCheckoutOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">جاري تحميل المتجر...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <StoreIcon className="w-12 h-12 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold mb-3">المتجر غير موجود</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          لم نتمكن من العثور على هذا المتجر. تأكد من صحة الرابط أو تواصل مع صاحب المتجر.
        </p>
        <Link to="/">
          <Button size="lg">العودة للرئيسية</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Hero Banner */}
      <div 
        className="relative h-72 md:h-96 overflow-hidden"
        style={store?.store_banner_url ? {
          backgroundImage: `url(${store.store_banner_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-background" />
        
        {/* Decorative Pattern */}
        {!store?.store_banner_url && (
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 25% 25%, hsl(var(--primary)) 2%, transparent 2%), radial-gradient(circle at 75% 75%, hsl(var(--primary)) 2%, transparent 2%)',
              backgroundSize: '60px 60px'
            }} />
          </div>
        )}

        {/* Cart Button - Fixed Top */}
        <div className="absolute top-4 left-4 z-20">
          <CartSheet
            cart={cart}
            totalItems={getTotalItems()}
            totalPrice={getTotalPrice()}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
            onCheckout={handleCheckout}
            open={cartOpen}
            onOpenChange={setCartOpen}
          />
        </div>

        {/* Store Info */}
        <div className="container mx-auto px-4 h-full flex items-end pb-8 relative z-10">
          <div className="flex items-end gap-6 w-full">
            {/* Logo */}
            <div className="flex-shrink-0 -mb-16 relative">
              {store?.store_logo_url ? (
                <img 
                  src={store.store_logo_url} 
                  alt={store.name}
                  className="w-28 h-28 md:w-36 md:h-36 rounded-2xl object-cover border-4 border-background shadow-2xl"
                />
              ) : (
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center border-4 border-background shadow-2xl">
                  <StoreIcon className="w-14 h-14 text-primary-foreground" />
                </div>
              )}
            </div>
            
            {/* Store Name & Description */}
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">
                  {store?.name}
                </h1>
                <Sparkles className="w-6 h-6 text-yellow-400" />
              </div>
              {store?.store_description && (
                <p className="text-white/80 max-w-2xl line-clamp-2 text-sm md:text-base">
                  {store.store_description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info Bar */}
      {(store?.store_phone || store?.store_email || store?.store_address) && (
        <div className="bg-card/80 backdrop-blur-md border-b shadow-sm sticky top-0 z-30">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-4 md:gap-6 text-sm">
                {store.store_phone && (
                  <a href={`tel:${store.store_phone}`} className="flex items-center gap-2 hover:text-primary transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <span>{store.store_phone}</span>
                  </a>
                )}
                {store.store_email && (
                  <a href={`mailto:${store.store_email}`} className="flex items-center gap-2 hover:text-primary transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <span className="hidden md:inline">{store.store_email}</span>
                  </a>
                )}
                {store.store_address && (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <span className="hidden md:inline">{store.store_address}</span>
                  </span>
                )}
              </div>

              {/* Cart Button - Sticky */}
              <div className="md:hidden">
                <CartSheet
                  cart={cart}
                  totalItems={getTotalItems()}
                  totalPrice={getTotalPrice()}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  onCheckout={handleCheckout}
                  open={cartOpen}
                  onOpenChange={setCartOpen}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 mt-8">
        {/* Search */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="ابحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-12 h-12 text-base rounded-xl border-2 focus:border-primary bg-card shadow-sm"
            />
          </div>
        </div>

        {/* Categories Slider */}
        {categories.length > 0 && !searchQuery && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">التصنيفات</h2>
              {selectedCategory && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                >
                  عرض الكل
                </Button>
              )}
            </div>
            <CategorySlider
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </section>
        )}

        {/* Products */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {selectedCategory 
                ? categories.find(c => c.id === selectedCategory)?.name || 'المنتجات'
                : 'جميع المنتجات'
              }
            </h2>
            <span className="text-muted-foreground text-sm">
              {filteredProducts.length} منتج
            </span>
          </div>
          
          {filteredProducts.length === 0 ? (
            <Card className="p-16 text-center border-dashed">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                <Package className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">لا توجد منتجات</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {searchQuery 
                  ? 'لم يتم العثور على منتجات تطابق بحثك، جرب كلمات أخرى' 
                  : 'لا توجد منتجات في هذا التصنيف حالياً'
                }
              </p>
              {(searchQuery || selectedCategory) && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(null);
                  }}
                >
                  عرض كل المنتجات
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onViewProduct={handleViewProduct}
                  onAddToCart={handleAddToCart}
                  onBuyNow={handleBuyNow}
                />
              ))}
            </div>
          )}
        </section>

        {/* About Section */}
        {store?.store_description && (
          <section className="mt-20">
            <Card className="p-8 md:p-12 bg-gradient-to-br from-muted/50 to-muted/20 border-0">
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="text-2xl font-bold mb-4">عن المتجر</h2>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  {store.store_description}
                </p>
              </div>
            </Card>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-card border-t mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {store?.store_logo_url ? (
                <img src={store.store_logo_url} alt={store.name} className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                  <StoreIcon className="w-5 h-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-bold">{store?.name}</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} {store?.name}. جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </footer>

      {/* Checkout Dialog */}
      {store && (
        <CheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          cart={cart}
          totalPrice={getTotalPrice()}
          storeId={store.id}
          storeName={store.name}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
};

export default Store;
