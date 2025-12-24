import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ShoppingCart, 
  Search, 
  Phone, 
  Mail, 
  MapPin,
  Package,
  Loader2,
  Store as StoreIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (storeSlug) {
      fetchStoreData();
    }
  }, [storeSlug]);

  const fetchStoreData = async () => {
    try {
      // Fetch store/workspace by slug
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

      // Fetch products for this workspace
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceData.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      setProducts(productsData || []);

      // Fetch categories for this workspace
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <StoreIcon className="w-24 h-24 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">المتجر غير موجود</h1>
        <p className="text-muted-foreground mb-4">لم نتمكن من العثور على هذا المتجر</p>
        <Link to="/">
          <Button>العودة للرئيسية</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <div 
        className="relative h-64 md:h-80 bg-gradient-to-br from-primary/20 to-primary/5"
        style={store?.store_banner_url ? {
          backgroundImage: `url(${store.store_banner_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="container mx-auto px-4 h-full flex items-center relative z-10">
          <div className="flex items-center gap-6">
            {store?.store_logo_url ? (
              <img 
                src={store.store_logo_url} 
                alt={store.name}
                className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover border-4 border-background shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-primary flex items-center justify-center border-4 border-background shadow-xl">
                <StoreIcon className="w-12 h-12 text-primary-foreground" />
              </div>
            )}
            <div className="text-white">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{store?.name}</h1>
              {store?.store_description && (
                <p className="text-white/80 max-w-lg">{store.store_description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info Bar */}
      {(store?.store_phone || store?.store_email || store?.store_address) && (
        <div className="bg-muted/50 border-b">
          <div className="container mx-auto px-4 py-3 flex flex-wrap gap-4 md:gap-8 text-sm">
            {store.store_phone && (
              <a href={`tel:${store.store_phone}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                <Phone className="w-4 h-4" />
                <span>{store.store_phone}</span>
              </a>
            )}
            {store.store_email && (
              <a href={`mailto:${store.store_email}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                <Mail className="w-4 h-4" />
                <span>{store.store_email}</span>
              </a>
            )}
            {store.store_address && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{store.store_address}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Search and Categories */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>
          
          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                الكل
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Featured Categories */}
        {categories.length > 0 && !searchQuery && !selectedCategory && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">التصنيفات</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {categories.map((category) => (
                <Card 
                  key={category.id}
                  className="p-4 cursor-pointer hover:border-primary transition-all hover:shadow-lg text-center"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.image_url ? (
                    <img 
                      src={category.image_url} 
                      alt={category.name}
                      className="w-16 h-16 mx-auto mb-3 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="w-8 h-8 text-primary" />
                    </div>
                  )}
                  <h3 className="font-semibold">{category.name}</h3>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        <section>
          <h2 className="text-2xl font-bold mb-6">
            {selectedCategory 
              ? categories.find(c => c.id === selectedCategory)?.name || 'المنتجات'
              : 'جميع المنتجات'
            }
          </h2>
          
          {filteredProducts.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">لا توجد منتجات</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'لم يتم العثور على منتجات تطابق بحثك' : 'لا توجد منتجات في هذا التصنيف'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden group hover:shadow-xl transition-all">
                  <div className="aspect-square bg-muted overflow-hidden">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-20 h-20 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-1 line-clamp-1">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-bold text-primary">{product.price} ريال</p>
                      {product.stock > 0 ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          متوفر
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          نفذ
                        </Badge>
                      )}
                    </div>
                    <Button className="w-full mt-4" disabled={product.stock === 0}>
                      <ShoppingCart className="w-4 h-4 ml-2" />
                      {product.stock > 0 ? 'أضف للسلة' : 'غير متوفر'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* About Section */}
        {store?.store_description && (
          <section className="mt-16">
            <Card className="p-8 bg-muted/30">
              <h2 className="text-2xl font-bold mb-4">عن المتجر</h2>
              <p className="text-muted-foreground leading-relaxed">{store.store_description}</p>
            </Card>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} {store?.name}. جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
};

export default Store;
