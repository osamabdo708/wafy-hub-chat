import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
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
  ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ColorAttribute {
  name: string;
  image?: string;
  price?: number;
  attributes?: {
    name: string;
    values: { value: string; price?: number; image?: string }[];
  }[];
}

interface CustomAttribute {
  name: string;
  values: { value: string; price?: number; image?: string }[];
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
  const [product, setProduct] = useState<Product | null>(null);
  const [store, setStore] = useState<StoreData | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  // Selection state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorAttribute | null>(null);
  const [selectedColorSubAttributes, setSelectedColorSubAttributes] = useState<Record<string, string>>({});
  const [selectedCustomAttributes, setSelectedCustomAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (storeSlug && productId) {
      fetchData();
    }
  }, [storeSlug, productId]);

  const fetchData = async () => {
    try {
      // Fetch store
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

      // Fetch product
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

      // Auto-select first color if available
      if (typedProduct.attributes?.colors?.length) {
        setSelectedColor(typedProduct.attributes.colors[0]);
        if (typedProduct.attributes.colors[0].image) {
          setSelectedImage(typedProduct.attributes.colors[0].image);
        }
      }

      // Fetch category
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
    if (color.image) {
      setSelectedImage(color.image);
    }
  };

  const calculateTotalPrice = () => {
    if (!product) return 0;
    
    let total = product.price;
    
    // Add color price
    if (selectedColor?.price) {
      total += selectedColor.price;
    }
    
    // Add color sub-attribute prices
    if (selectedColor?.attributes) {
      selectedColor.attributes.forEach(attr => {
        const selectedValue = selectedColorSubAttributes[attr.name];
        const valueObj = attr.values.find(v => v.value === selectedValue);
        if (valueObj?.price) {
          total += valueObj.price;
        }
      });
    }
    
    // Add custom attribute prices
    if (product.attributes?.custom) {
      product.attributes.custom.forEach(attr => {
        const selectedValue = selectedCustomAttributes[attr.name];
        const valueObj = attr.values.find(v => v.value === selectedValue);
        if (valueObj?.price) {
          total += valueObj.price;
        }
      });
    }
    
    return total * quantity;
  };

  const getAllImages = () => {
    const images: string[] = [];
    
    if (product?.image_url) {
      images.push(product.image_url);
    }
    
    if (product?.gallery_images) {
      images.push(...product.gallery_images);
    }
    
    // Add color images
    if (product?.attributes?.colors) {
      product.attributes.colors.forEach(color => {
        if (color.image && !images.includes(color.image)) {
          images.push(color.image);
        }
      });
    }
    
    return images;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !product || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Package className="w-24 h-24 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">المنتج غير موجود</h1>
        <p className="text-muted-foreground mb-4">لم نتمكن من العثور على هذا المنتج</p>
        <Link to={`/store/${storeSlug}`}>
          <Button>العودة للمتجر</Button>
        </Link>
      </div>
    );
  }

  const allImages = getAllImages();
  const totalPrice = calculateTotalPrice();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to={`/store/${storeSlug}`} className="flex items-center gap-2 hover:text-primary transition-colors">
            {store.store_logo_url ? (
              <img src={store.store_logo_url} alt={store.name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <Package className="w-8 h-8 text-primary" />
            )}
            <span className="font-bold">{store.name}</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          {category && (
            <>
              <span className="text-muted-foreground">{category.name}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </>
          )}
          <span className="text-muted-foreground line-clamp-1">{product.name}</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="aspect-square bg-muted rounded-2xl overflow-hidden">
              {selectedImage ? (
                <img 
                  src={selectedImage} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-32 h-32 text-muted-foreground" />
                </div>
              )}
            </div>
            
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(img)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === img ? 'border-primary' : 'border-transparent hover:border-primary/50'
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
              <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
              {product.description && (
                <p className="text-muted-foreground leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Stock Badge */}
            <div>
              {product.stock > 0 ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100">
                  متوفر ({product.stock} قطعة)
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100">
                  غير متوفر
                </Badge>
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
                      className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                        selectedColor?.name === color.name 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {color.image ? (
                        <img src={color.image} alt={color.name} className="w-16 h-16 object-cover" />
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
                {selectedColor?.price && selectedColor.price > 0 && (
                  <p className="text-sm text-muted-foreground">
                    + {selectedColor.price} ريال
                  </p>
                )}
              </div>
            )}

            {/* Color Sub-Attributes (e.g., sizes per color) */}
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
                          className={`px-4 py-2 rounded-lg border-2 transition-all ${
                            selectedColorSubAttributes[attr.name] === val.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <span>{val.value}</span>
                          {val.price && val.price > 0 && (
                            <span className="text-xs text-muted-foreground mr-1">
                              (+{val.price})
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
                          className={`px-4 py-2 rounded-lg border-2 transition-all ${
                            selectedCustomAttributes[attr.name] === val.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <span>{val.value}</span>
                          {val.price && val.price > 0 && (
                            <span className="text-xs text-muted-foreground mr-1">
                              (+{val.price})
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
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-12 text-center font-semibold">{quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    disabled={quantity >= product.stock}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Price */}
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">السعر الإجمالي</span>
                <span className="text-3xl font-bold text-primary">{totalPrice} ريال</span>
              </div>
              {quantity > 1 && (
                <p className="text-sm text-muted-foreground mt-1">
                  ({calculateTotalPrice() / quantity} ريال × {quantity})
                </p>
              )}
            </Card>

            {/* Add to Cart */}
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              disabled={product.stock === 0}
            >
              <ShoppingCart className="w-5 h-5 ml-2" />
              {product.stock > 0 ? 'أضف للسلة' : 'غير متوفر'}
            </Button>

            {/* Back to Store */}
            <Link to={`/store/${storeSlug}`}>
              <Button variant="outline" className="w-full">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للمتجر
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} {store.name}. جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
};

export default ProductDetails;
