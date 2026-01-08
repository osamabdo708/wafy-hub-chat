import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Package,
  Loader2,
  ArrowRight,
  Zap,
  Heart
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStoreCart } from "@/hooks/useStoreCart";
import { CartSheet } from "@/components/store/CartSheet";
import { CheckoutDialog } from "@/components/store/CheckoutDialog";

interface ColorAttribute {
  name: string;
  hex?: string;
  image_url?: string;
  price?: number;
  attributes?: {
    name: string;
    values: { value: string; price?: number; image_url?: string }[];
  }[];
}

interface CustomAttribute {
  name: string;
  values: { value: string; price?: number; image_url?: string }[];
}

interface ProductAttributes {
  colors?: ColorAttribute[];
  custom?: CustomAttribute[];
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_id?: string;
  stock: number;
  image_url?: string;
  gallery_images?: string[];
  is_active: boolean;
  attributes?: ProductAttributes;
  min_negotiable_price?: number;
}

interface Category {
  id: string;
  name: string;
}

interface StoreData {
  id: string;
  name: string;
  store_slug: string;
  store_logo_url?: string;
}

const ProductDetails = () => {
  const { storeSlug, productId } = useParams<{ storeSlug: string; productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [store, setStore] = useState<StoreData | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  
  // Selection state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorAttribute | null>(null);
  const [selectedColorSubAttributes, setSelectedColorSubAttributes] = useState<Record<string, string>>({});
  const [selectedCustomAttributes, setSelectedCustomAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  const { 
    cart, 
    addToCart, 
    removeFromCart, 
    updateQuantity: updateCartQuantity, 
    clearCart, 
    getTotalItems, 
    getTotalPrice 
  } = useStoreCart(store?.id || '');

  useEffect(() => {
    if (storeSlug && productId) {
      fetchData();
    }
  }, [storeSlug, productId]);

  const fetchData = async () => {
    try {
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id, name, store_slug, store_logo_url')
        .eq('store_slug', storeSlug)
        .eq('store_enabled', true)
        .maybeSingle();

      if (workspaceError || !workspaceData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setStore(workspaceData);

      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('workspace_id', workspaceData.id)
        .eq('is_active', true)
        .maybeSingle();

      if (productError || !productData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const typedProduct = productData as unknown as Product;
      setProduct(typedProduct);
      setSelectedImage(typedProduct.image_url || null);

      if (typedProduct.attributes?.colors?.length) {
        setSelectedColor(typedProduct.attributes.colors[0]);
        if (typedProduct.attributes.colors[0].image_url) {
          setSelectedImage(typedProduct.attributes.colors[0].image_url);
        }
      }

      if (typedProduct.category_id) {
        const { data: categoryData } = await supabase
          .from('categories')
          .select('id, name')
          .eq('id', typedProduct.category_id)
          .maybeSingle();
        
        setCategory(categoryData);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleColorSelect = (color: ColorAttribute) => {
    setSelectedColor(color);
    setSelectedColorSubAttributes({});
    if (color.image_url) {
      setSelectedImage(color.image_url);
    }
  };

  const calculateUnitPrice = () => {
    if (!product) return 0;
    
    let total = Number(product.price) || 0;
    
    if (selectedColor?.price) {
      total += Number(selectedColor.price) || 0;
    }
    
    if (selectedColor?.attributes) {
      selectedColor.attributes.forEach(attr => {
        const selectedValue = selectedColorSubAttributes[attr.name];
        const valueObj = attr.values.find(v => v.value === selectedValue);
        if (valueObj?.price) {
          total += Number(valueObj.price) || 0;
        }
      });
    }
    
    if (product.attributes?.custom) {
      product.attributes.custom.forEach(attr => {
        const selectedValue = selectedCustomAttributes[attr.name];
        const valueObj = attr.values.find(v => v.value === selectedValue);
        if (valueObj?.price) {
          total += Number(valueObj.price) || 0;
        }
      });
    }
    
    return total;
  };

  const calculateTotalPrice = () => {
    return calculateUnitPrice() * quantity;
  };

  const getAllImages = () => {
    const images: string[] = [];
    
    if (product?.image_url) {
      images.push(product.image_url);
    }
    
    if (product?.gallery_images) {
      images.push(...product.gallery_images);
    }
    
    if (product?.attributes?.colors) {
      product.attributes.colors.forEach(color => {
        if (color.image_url && !images.includes(color.image_url)) {
          images.push(color.image_url);
        }
      });
    }
    
    return images;
  };

  const handleAddToCart = () => {
    if (!product) return;
    
    addToCart({
      productId: product.id,
      name: product.name,
      price: calculateUnitPrice(),
      quantity: quantity,
      imageUrl: selectedImage || product.image_url,
      selectedColor: selectedColor?.name,
      selectedAttributes: {
        ...selectedColorSubAttributes,
        ...selectedCustomAttributes
      }
    });
    toast.success('تمت الإضافة للسلة');
  };

  const handleBuyNow = () => {
    if (!product) return;
    
    addToCart({
      productId: product.id,
      name: product.name,
      price: calculateUnitPrice(),
      quantity: quantity,
      imageUrl: selectedImage || product.image_url,
      selectedColor: selectedColor?.name,
      selectedAttributes: {
        ...selectedColorSubAttributes,
        ...selectedCustomAttributes
      }
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
          <p className="text-muted-foreground">جاري تحميل المنتج...</p>
        </div>
      </div>
    );
  }

  if (notFound || !product || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <Package className="w-12 h-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">المنتج غير موجود</h1>
        <p className="text-muted-foreground mb-6">لم نتمكن من العثور على هذا المنتج</p>
        <Link to={`/store/${storeSlug}`}>
          <Button size="lg">العودة للمتجر</Button>
        </Link>
      </div>
    );
  }

  const allImages = getAllImages();
  const totalPrice = calculateTotalPrice();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm overflow-hidden">
            <Link to={`/store/${storeSlug}`} className="flex items-center gap-2 hover:text-primary transition-colors flex-shrink-0">
              {store.store_logo_url ? (
                <img src={store.store_logo_url} alt={store.name} className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <Package className="w-8 h-8 text-primary" />
              )}
              <span className="font-bold hidden md:inline">{store.name}</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {category && (
              <>
                <span className="text-muted-foreground truncate hidden sm:inline">{category.name}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 hidden sm:inline" />
              </>
            )}
            <span className="text-muted-foreground truncate max-w-[150px] md:max-w-none">{product.name}</span>
          </div>
          
          <CartSheet
            cart={cart}
            totalItems={getTotalItems()}
            totalPrice={getTotalPrice()}
            onUpdateQuantity={updateCartQuantity}
            onRemove={removeFromCart}
            onCheckout={handleCheckout}
            open={cartOpen}
            onOpenChange={setCartOpen}
          />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="aspect-square bg-card rounded-3xl overflow-hidden shadow-lg">
              {selectedImage ? (
                <img 
                  src={selectedImage} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Package className="w-32 h-32 text-muted-foreground/50" />
                </div>
              )}
            </div>
            
            {allImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(img)}
                    className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all ${
                      selectedImage === img 
                        ? 'ring-4 ring-primary ring-offset-2 scale-105' 
                        : 'border-2 border-border hover:border-primary/50 hover:scale-105'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl md:text-4xl font-bold">{product.name}</h1>
                <Button variant="ghost" size="icon" className="rounded-full flex-shrink-0">
                  <Heart className="w-5 h-5" />
                </Button>
              </div>
              {product.description && (
                <p className="text-muted-foreground leading-relaxed mt-3">{product.description}</p>
              )}
            </div>

            {/* Stock Badge */}
            <div>
              {product.stock > 0 ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                  متوفر ({product.stock} قطعة)
                </Badge>
              ) : (
                <Badge variant="destructive">غير متوفر</Badge>
              )}
            </div>

            {/* Colors */}
            {product.attributes?.colors && product.attributes.colors.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">اللون</h3>
                <div className="flex flex-wrap gap-3">
                  {product.attributes.colors.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorSelect(color)}
                      className={`relative rounded-xl overflow-hidden transition-all ${
                        selectedColor?.name === color.name 
                          ? 'ring-4 ring-primary ring-offset-2 scale-105' 
                          : 'border-2 border-border hover:border-primary/50 hover:scale-105'
                      }`}
                    >
                      {color.image_url ? (
                        <img src={color.image_url} alt={color.name} className="w-16 h-16 object-cover" />
                      ) : (
                        <div className="w-16 h-16 bg-muted flex items-center justify-center text-xs font-medium">
                          {color.name}
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs py-1 text-center">
                        {color.name}
                      </div>
                    </button>
                  ))}
                </div>
                {selectedColor?.price && Number(selectedColor.price) > 0 && (
                  <p className="text-sm text-primary font-medium">
                    + {Number(selectedColor.price)} ₪
                  </p>
                )}
              </div>
            )}

            {/* Color Sub-Attributes */}
            {selectedColor?.attributes && selectedColor.attributes.length > 0 && (
              <div className="space-y-4">
                {selectedColor.attributes.map((attr, attrIndex) => (
                  <div key={attrIndex} className="space-y-3">
                    <h3 className="font-semibold">{attr.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {attr.values.map((val, valIndex) => (
                        <button
                          key={valIndex}
                          onClick={() => setSelectedColorSubAttributes(prev => ({
                            ...prev,
                            [attr.name]: val.value
                          }))}
                          className={`px-4 py-2.5 rounded-xl transition-all ${
                            selectedColorSubAttributes[attr.name] === val.value
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'bg-muted hover:bg-muted/80 border border-border'
                          }`}
                        >
                          <span>{val.value}</span>
                          {val.price && Number(val.price) > 0 && (
                            <span className="text-xs opacity-75 mr-1">
                              (+{Number(val.price)} ₪)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Attributes */}
            {product.attributes?.custom && product.attributes.custom.length > 0 && (
              <div className="space-y-4">
                {product.attributes.custom.map((attr, attrIndex) => (
                  <div key={attrIndex} className="space-y-3">
                    <h3 className="font-semibold">{attr.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {attr.values.map((val, valIndex) => (
                        <button
                          key={valIndex}
                          onClick={() => setSelectedCustomAttributes(prev => ({
                            ...prev,
                            [attr.name]: val.value
                          }))}
                          className={`px-4 py-2.5 rounded-xl transition-all ${
                            selectedCustomAttributes[attr.name] === val.value
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'bg-muted hover:bg-muted/80 border border-border'
                          }`}
                        >
                          <span>{val.value}</span>
                          {val.price && Number(val.price) > 0 && (
                            <span className="text-xs opacity-75 mr-1">
                              (+{Number(val.price)} ₪)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-3">
              <h3 className="font-semibold">الكمية</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-muted rounded-xl overflow-hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none h-12 w-12"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-14 text-center font-bold text-lg">{quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none h-12 w-12"
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    disabled={quantity >= product.stock}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Price Card */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">السعر الإجمالي</span>
                <span className="text-4xl font-bold text-primary">{totalPrice} ₪</span>
              </div>
              {quantity > 1 && (
                <p className="text-sm text-muted-foreground mt-2">
                  ({calculateUnitPrice()} ₪ × {quantity})
                </p>
              )}
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                size="lg" 
                variant="outline"
                className="flex-1 h-14 text-base font-semibold"
                onClick={handleAddToCart}
                disabled={product.stock === 0}
              >
                <ShoppingCart className="w-5 h-5 ml-2" />
                أضف للسلة
              </Button>
              <Button 
                size="lg" 
                className="flex-1 h-14 text-base font-semibold"
                onClick={handleBuyNow}
                disabled={product.stock === 0}
              >
                <Zap className="w-5 h-5 ml-2" />
                اشتري الآن
              </Button>
            </div>

            {/* Back to Store */}
            <Link to={`/store/${storeSlug}`}>
              <Button variant="ghost" className="w-full">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للمتجر
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-card border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} {store.name}. جميع الحقوق محفوظة</p>
        </div>
      </footer>

      {/* Checkout Dialog */}
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        totalPrice={getTotalPrice()}
        storeId={store.id}
        storeName={store.name}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
};

export default ProductDetails;
