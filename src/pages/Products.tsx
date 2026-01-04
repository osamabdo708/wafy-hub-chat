import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Edit, Loader2, Upload, X, Image as ImageIcon, Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم طويل جداً"),
  description: z.string().trim().max(1000, "الوصف طويل جداً").optional(),
  price: z.string().trim().min(1, "السعر مطلوب"),
  min_negotiable_price: z.string().trim().optional(),
  category: z.string().trim().max(100, "الفئة طويلة جداً").optional(),
  stock: z.string().trim(),
});

interface ColorAttribute {
  name: string;
  hex: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  min_negotiable_price?: number;
  category?: string;
  category_id?: string;
  stock: number;
  image_url?: string;
  gallery_images?: string[];
  attributes?: { colors?: ColorAttribute[] };
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
}

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    min_negotiable_price: "",
    category_id: "",
    stock: "0",
    image_url: "",
    gallery_images: [] as string[],
    colors: [] as ColorAttribute[],
  });
  const [newColor, setNewColor] = useState({ name: "", hex: "#000000" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .single();

      if (workspace) {
        setWorkspaceId(workspace.id);
        fetchCategories(workspace.id);
      }

      fetchProducts();
    };
    init();
  }, []);

  const fetchCategories = async (wsId: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('workspace_id', wsId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Cast the data to our Product type
      const typedProducts = (data || []).map((p) => ({
        ...p,
        attributes: p.attributes as { colors?: ColorAttribute[] } | undefined,
      })) as Product[];
      setProducts(typedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('فشل تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('فشل رفع الصورة');
      return null;
    }
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingThumbnail(true);
    const url = await uploadImage(file);
    if (url) {
      setFormData({ ...formData, image_url: url });
    }
    setUploadingThumbnail(false);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingGallery(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const url = await uploadImage(file);
      if (url) {
        newUrls.push(url);
      }
    }

    setFormData({
      ...formData,
      gallery_images: [...formData.gallery_images, ...newUrls],
    });
    setUploadingGallery(false);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  };

  const removeGalleryImage = (index: number) => {
    const newGallery = formData.gallery_images.filter((_, i) => i !== index);
    setFormData({ ...formData, gallery_images: newGallery });
  };

  const removeThumbnail = () => {
    setFormData({ ...formData, image_url: "" });
  };

  const addColor = () => {
    if (!newColor.name.trim()) {
      toast.error("يرجى إدخال اسم اللون");
      return;
    }
    setFormData({
      ...formData,
      colors: [...formData.colors, { name: newColor.name.trim(), hex: newColor.hex }],
    });
    setNewColor({ name: "", hex: "#000000" });
  };

  const removeColor = (index: number) => {
    setFormData({
      ...formData,
      colors: formData.colors.filter((_, i) => i !== index),
    });
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || "",
        price: product.price.toString(),
        min_negotiable_price: product.min_negotiable_price?.toString() || "",
        category_id: product.category_id || "",
        stock: product.stock.toString(),
        image_url: product.image_url || "",
        gallery_images: product.gallery_images || [],
        colors: product.attributes?.colors || [],
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        description: "",
        price: "",
        min_negotiable_price: "",
        category_id: "",
        stock: "0",
        image_url: "",
        gallery_images: [],
        colors: [],
      });
    }
    setFormErrors({});
    setNewColor({ name: "", hex: "#000000" });
    setDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    try {
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
        min_negotiable_price: formData.min_negotiable_price ? parseFloat(formData.min_negotiable_price) : null,
        category_id: formData.category_id || null,
        stock: parseInt(formData.stock),
        image_url: formData.image_url || null,
        gallery_images: formData.gallery_images,
        attributes: JSON.parse(JSON.stringify({ colors: formData.colors })),
        is_active: true,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        if (!workspaceId) {
          toast.error('فشل في تحديد مساحة العمل');
          return;
        }

        const { error } = await supabase
          .from('products')
          .insert([{ ...productData, workspace_id: workspaceId }]);

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
                    {product.category_id && (
                      <Badge variant="secondary">
                        {categories.find(c => c.id === product.category_id)?.name || 'غير مصنف'}
                      </Badge>
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
                    {product.min_negotiable_price && (
                      <p className="text-xs text-muted-foreground">
                        الحد الأدنى للتفاوض: {product.min_negotiable_price} ريال
                      </p>
                    )}
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
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                <Label htmlFor="min_negotiable_price">الحد الأدنى للتفاوض (ريال)</Label>
                <Input
                  id="min_negotiable_price"
                  type="number"
                  step="0.01"
                  value={formData.min_negotiable_price}
                  onChange={(e) => setFormData({ ...formData, min_negotiable_price: e.target.value })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">للمارد الذكي</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label htmlFor="category_id">الفئة</Label>
                <Select 
                  value={formData.category_id || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, category_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر فئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون فئة</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Thumbnail Upload */}
            <div className="space-y-2">
              <Label>الصورة الرئيسية</Label>
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailUpload}
                className="hidden"
              />
              {formData.image_url ? (
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                  <img
                    src={formData.image_url}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 w-6 h-6"
                    onClick={removeThumbnail}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={uploadingThumbnail}
                >
                  {uploadingThumbnail ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6" />
                      <span className="text-sm">رفع صورة رئيسية</span>
                    </div>
                  )}
                </Button>
              )}
            </div>

            {/* Gallery Upload */}
            <div className="space-y-2">
              <Label>معرض الصور</Label>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryUpload}
                className="hidden"
              />
              
              <div className="grid grid-cols-4 gap-2">
                {formData.gallery_images.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img
                      src={url}
                      alt={`Gallery ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 w-5 h-5"
                      onClick={() => removeGalleryImage(index)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  className="aspect-square border-dashed"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingGallery}
                >
                  {uploadingGallery ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-xs">إضافة</span>
                    </div>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">يمكنك إضافة عدة صور للمنتج</p>
            </div>

            {/* Color Attributes */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                الألوان المتوفرة
              </Label>
              
              {/* Existing Colors */}
              {formData.colors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.colors.map((color, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/50"
                    >
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm">{color.name}</span>
                      <span className="text-xs text-muted-foreground">{color.hex}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="w-5 h-5 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => removeColor(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Color */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="colorName" className="text-xs">اسم اللون</Label>
                  <Input
                    id="colorName"
                    value={newColor.name}
                    onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                    placeholder="مثال: أحمر"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="colorHex" className="text-xs">كود اللون</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="colorPicker"
                      value={newColor.hex}
                      onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer border"
                    />
                    <Input
                      id="colorHex"
                      value={newColor.hex}
                      onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                      placeholder="#000000"
                      className="w-24"
                    />
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={addColor}>
                  <Plus className="w-4 h-4 ml-1" />
                  إضافة
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSaveProduct} disabled={saving || uploadingThumbnail || uploadingGallery}>
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