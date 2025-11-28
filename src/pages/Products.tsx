import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Edit, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم طويل جداً"),
  description: z.string().trim().max(1000, "الوصف طويل جداً").optional(),
  price: z.string().trim().min(1, "السعر مطلوب"),
  category: z.string().trim().max(100, "الفئة طويلة جداً").optional(),
  stock: z.string().trim(),
  image_url: z.string().trim().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
});

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  stock: number;
  image_url?: string;
  is_active: boolean;
}

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    stock: "0",
    image_url: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('فشل تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || "",
        price: product.price.toString(),
        category: product.category || "",
        stock: product.stock.toString(),
        image_url: product.image_url || "",
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "",
        stock: "0",
        image_url: "",
      });
    }
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    try {
      // Validate form
      const result = productSchema.safeParse(formData);
      if (!result.success) {
        const errors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setFormErrors(errors);
        return;
      }

      setSaving(true);

      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        category: formData.category.trim() || null,
        stock: parseInt(formData.stock),
        image_url: formData.image_url.trim() || null,
        is_active: true,
      };

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        // Create new product
        const { error } = await supabase
          .from('products')
          .insert(productData);

        if (error) throw error;
        toast.success('تم إضافة المنتج بنجاح');
      }

      setDialogOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('فشل حفظ المنتج');
    } finally {
      setSaving(false);
    }
  };

  const inStockCount = products.filter(p => p.stock > 0).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="text-muted-foreground mt-1">إدارة كتالوج المنتجات</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 ml-2" />
          إضافة منتج
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المنتجات</p>
              <h3 className="text-2xl font-bold mt-1">{products.length}</h3>
            </div>
            <Package className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">متوفر في المخزون</p>
              <h3 className="text-2xl font-bold mt-1 text-success">{inStockCount}</h3>
            </div>
            <Package className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">نفد من المخزون</p>
              <h3 className="text-2xl font-bold mt-1 text-destructive">{outOfStockCount}</h3>
            </div>
            <Package className="w-8 h-8 text-destructive" />
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">لا توجد منتجات</h3>
            <p className="text-muted-foreground mb-4">ابدأ بإضافة منتجك الأول</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة منتج
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video bg-muted overflow-hidden">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-lg mb-1">{product.name}</h3>
                    {product.category && (
                      <Badge variant="secondary">{product.category}</Badge>
                    )}
                  </div>
                </div>
                
                {product.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {product.description}
                  </p>
                )}
                
                <div className="flex items-center justify-between mt-4">
                  <div>
                    <p className="text-2xl font-bold text-primary">{product.price} ريال</p>
                    <p className="text-sm text-muted-foreground">
                      المخزون: {product.stock}
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleOpenDialog(product)}
                  >
                    <Edit className="w-4 h-4 ml-1" />
                    تعديل
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}
            </DialogTitle>
            <DialogDescription>
              أدخل معلومات المنتج أدناه
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">اسم المنتج *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: زيت الأرغان الطبيعي"
              />
              {formErrors.name && (
                <p className="text-sm text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف المنتج"
                rows={3}
              />
              {formErrors.description && (
                <p className="text-sm text-destructive">{formErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">السعر (ريال) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
                {formErrors.price && (
                  <p className="text-sm text-destructive">{formErrors.price}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock">الكمية *</Label>
                <Input
                  id="stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="0"
                />
                {formErrors.stock && (
                  <p className="text-sm text-destructive">{formErrors.stock}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">الفئة</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="مثال: عناية بالبشرة"
              />
              {formErrors.category && (
                <p className="text-sm text-destructive">{formErrors.category}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="image_url">رابط الصورة</Label>
              <Input
                id="image_url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
              {formErrors.image_url && (
                <p className="text-sm text-destructive">{formErrors.image_url}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSaveProduct} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              {editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
