import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Edit, Loader2, Upload, X, Image as ImageIcon, Palette, Tags, Trash2, RefreshCw, ShoppingBag, ExternalLink, DollarSign, Package2, Truck, Search, FileText, Settings } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم طويل جداً"),
  description: z.string().trim().max(5000, "الوصف طويل جداً").optional(),
  price: z.string().trim().min(1, "السعر مطلوب"),
  compare_at_price: z.string().trim().optional(),
  min_negotiable_price: z.string().trim().optional(),
  category: z.string().trim().max(100, "الفئة طويلة جداً").optional(),
  stock: z.string().trim(),
  sku: z.string().trim().max(100, "SKU طويل جداً").optional(),
  barcode: z.string().trim().max(100, "الباركود طويل جداً").optional(),
  vendor: z.string().trim().max(100, "المورد طويل جداً").optional(),
  product_type: z.string().trim().max(100, "نوع المنتج طويل جداً").optional(),
  tags: z.string().trim().max(500, "الوسوم طويلة جداً").optional(),
  weight: z.string().trim().optional(),
  seo_title: z.string().trim().max(70, "عنوان SEO طويل جداً").optional(),
  seo_description: z.string().trim().max(320, "وصف SEO طويل جداً").optional(),
  handle: z.string().trim().max(255, "الرابط طويل جداً").optional(),
});

interface OptionValue {
  value: string;
  image_url?: string;
}

interface ProductOption {
  name: string; // e.g., "Size", "Color", "Material"
  values: OptionValue[]; // e.g., ["Small", "Medium", "Large"]
}

interface ProductVariant {
  id?: string;
  option1?: string; // First option value
  option2?: string; // Second option value
  option3?: string; // Third option value
  price?: number; // Variant-specific price (overrides base price)
  sku?: string;
  barcode?: string;
  inventory_quantity?: number;
  weight?: number;
  image_url?: string;
}

// Legacy interfaces for backward compatibility
interface AttributeValue {
  value: string;
  image_url?: string;
  price?: number;
}

interface CustomAttribute {
  name: string;
  values: AttributeValue[];
}

interface ColorAttribute {
  name: string;
  hex: string;
  image_url?: string;
  price?: number;
  attributes?: CustomAttribute[];
}

interface ProductAttributes {
  // Shopify-style options and variants
  options?: ProductOption[]; // Up to 3 options (e.g., Size, Color, Material)
  variants?: ProductVariant[]; // Generated combinations of option values
  
  // Legacy support
  colors?: ColorAttribute[];
  custom?: CustomAttribute[];
  
  shopify_id?: number;
  vendor?: string;
  product_type?: string;
  tags?: string;
  sku?: string;
  barcode?: string;
  compare_at_price?: number;
  weight?: string;
  weight_unit?: string;
  requires_shipping?: boolean;
  seo_title?: string;
  seo_description?: string;
  handle?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  min_negotiable_price?: number;
  purchase_price?: number;
  category?: string;
  category_id?: string;
  stock: number;
  image_url?: string;
  gallery_images?: string[];
  attributes?: ProductAttributes;
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
  const [syncingProduct, setSyncingProduct] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    compare_at_price: "",
    min_negotiable_price: "",
    purchase_price: "",
    category_id: "",
    stock: "0",
    image_url: "",
    gallery_images: [] as string[],
    // Shopify-style options (up to 3)
    options: [] as ProductOption[],
    variants: [] as ProductVariant[],
    sku: "",
    barcode: "",
    vendor: "",
    product_type: "",
    tags: "",
    track_quantity: true,
    is_active: true,
    weight: "",
    weight_unit: "kg",
    requires_shipping: true,
    seo_title: "",
    seo_description: "",
    handle: "",
  });
  const [newOptionName, setNewOptionName] = useState("");
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [editingOptionName, setEditingOptionName] = useState("");
  const [editingOptionValues, setEditingOptionValues] = useState<string[]>([]);
  const [newOptionValueInput, setNewOptionValueInput] = useState("");
  const [groupByOption, setGroupByOption] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
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

  // Auto-generate variants when options change (only when dialog is open)
  useEffect(() => {
    if (!dialogOpen) return;
    
    const optionsWithValues = formData.options.filter(opt => opt.values.length > 0);
    
    if (optionsWithValues.length === 0) {
      setFormData(prev => ({ ...prev, variants: [] }));
      return;
    }

    // Get all value arrays
    const valueArrays = optionsWithValues.map(opt => opt.values.map(v => v.value));
    
    // Generate all combinations
    const combinations: string[][] = [];
    const generateCombinations = (arrays: string[][], current: string[] = [], index: number = 0) => {
      if (index === arrays.length) {
        combinations.push([...current]);
        return;
      }
      for (const value of arrays[index]) {
        current.push(value);
        generateCombinations(arrays, current, index + 1);
        current.pop();
      }
    };
    
    generateCombinations(valueArrays);
    
    // Create variants from combinations
    setFormData(prev => {
      const newVariants: ProductVariant[] = combinations.map((combo, idx) => {
        // Check if variant already exists
        const existing = prev.variants.find(v => 
          v.option1 === combo[0] && 
          v.option2 === combo[1] && 
          v.option3 === combo[2]
        );
        
        if (existing) {
          return existing;
        }
        
        return {
          id: `variant-${Date.now()}-${idx}`,
          option1: combo[0] || undefined,
          option2: combo[1] || undefined,
          option3: combo[2] || undefined,
          price: prev.price ? parseFloat(prev.price) : undefined,
          inventory_quantity: prev.track_quantity ? parseInt(prev.stock) : undefined,
        };
      });
      
      return { ...prev, variants: newVariants };
    });
  }, [formData.options.map(opt => `${opt.name}:${opt.values.map(v => v.value).join(',')}`).join('|'), dialogOpen]);

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


  // Shopify-style Options and Variants functions
  const addOption = () => {
    if (formData.options.length >= 3) {
      toast.error("يمكنك إضافة 3 خيارات كحد أقصى");
      return;
    }
    if (!newOptionName.trim()) {
      toast.error("يرجى إدخال اسم الخيار");
      return;
    }
    setFormData({
      ...formData,
      options: [...formData.options, { name: newOptionName.trim(), values: [] }],
    });
    setNewOptionName("");
  };

  const removeOption = (index: number) => {
    const updatedOptions = formData.options.filter((_, i) => i !== index);
    setFormData({ ...formData, options: updatedOptions });
  };


  // Generate all variant combinations from options (like Shopify)
  const generateVariants = () => {
    if (formData.options.length === 0) {
      setFormData({ ...formData, variants: [] });
      return;
    }

    // Get all value arrays
    const valueArrays = formData.options.map(opt => opt.values.map(v => v.value));
    
    // Generate all combinations
    const combinations: string[][] = [];
    const generateCombinations = (arrays: string[][], current: string[] = [], index: number = 0) => {
      if (index === arrays.length) {
        combinations.push([...current]);
        return;
      }
      for (const value of arrays[index]) {
        current.push(value);
        generateCombinations(arrays, current, index + 1);
        current.pop();
      }
    };
    
    generateCombinations(valueArrays);
    
    // Create variants from combinations
    const newVariants: ProductVariant[] = combinations.map((combo, idx) => {
      // Check if variant already exists
      const existing = formData.variants.find(v => 
        v.option1 === combo[0] && 
        v.option2 === combo[1] && 
        v.option3 === combo[2]
      );
      
      if (existing) {
        return existing;
      }
      
      return {
        id: `variant-${idx}`,
        option1: combo[0] || undefined,
        option2: combo[1] || undefined,
        option3: combo[2] || undefined,
        price: formData.price ? parseFloat(formData.price) : undefined,
        inventory_quantity: formData.track_quantity ? parseInt(formData.stock) : undefined,
      };
    });
    
    setFormData({ ...formData, variants: newVariants });
  };

  const updateVariant = (variantId: string, updates: Partial<ProductVariant>) => {
    const updatedVariants = formData.variants.map(v => 
      v.id === variantId ? { ...v, ...updates } : v
    );
    setFormData({ ...formData, variants: updatedVariants });
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || "",
        price: product.price.toString(),
        compare_at_price: product.attributes?.compare_at_price?.toString() || "",
        min_negotiable_price: product.min_negotiable_price?.toString() || "",
        purchase_price: product.purchase_price?.toString() || "",
        category_id: product.category_id || "",
        stock: product.stock.toString(),
        image_url: product.image_url || "",
        gallery_images: product.gallery_images || [],
        options: product.attributes?.options || [],
        variants: product.attributes?.variants || [],
        sku: product.attributes?.sku || "",
        barcode: product.attributes?.barcode || "",
        vendor: product.attributes?.vendor || "",
        product_type: product.attributes?.product_type || "",
        tags: product.attributes?.tags || "",
        track_quantity: true,
        is_active: product.is_active,
        weight: product.attributes?.weight || "",
        weight_unit: product.attributes?.weight_unit || "kg",
        requires_shipping: product.attributes?.requires_shipping !== false,
        seo_title: product.attributes?.seo_title || "",
        seo_description: product.attributes?.seo_description || "",
        handle: product.attributes?.handle || "",
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        description: "",
        price: "",
        compare_at_price: "",
        min_negotiable_price: "",
        purchase_price: "",
        category_id: "",
        stock: "0",
        image_url: "",
        gallery_images: [],
        options: [],
        variants: [],
        sku: "",
        barcode: "",
        vendor: "",
        product_type: "",
        tags: "",
        track_quantity: true,
        is_active: true,
        weight: "",
        weight_unit: "kg",
        requires_shipping: true,
        seo_title: "",
        seo_description: "",
        handle: "",
      });
    }
    setFormErrors({});
    setEditingOptionIndex(null);
    setEditingOptionName("");
    setEditingOptionValues([]);
    setNewOptionValueInput("");
    setGroupByOption("");
    setExpandedGroups(new Set());
    setExpandAll(false);
    setDialogOpen(true);
  };

  // Option editing functions (Shopify-style)
  const startEditingOption = (index: number) => {
    const option = formData.options[index];
    setEditingOptionIndex(index);
    setEditingOptionName(option.name);
    setEditingOptionValues(option.values.map(v => v.value));
  };

  const saveOptionEdit = () => {
    if (!editingOptionName.trim() || editingOptionIndex === null) return;
    
    const updatedOptions = [...formData.options];
    updatedOptions[editingOptionIndex] = {
      name: editingOptionName.trim(),
      values: editingOptionValues.map(v => ({ value: v.trim() })).filter(v => v.value)
    };
    
    setFormData({ ...formData, options: updatedOptions });
    setEditingOptionIndex(null);
    setEditingOptionName("");
    setEditingOptionValues([]);
  };

  const cancelOptionEdit = () => {
    setEditingOptionIndex(null);
    setEditingOptionName("");
    setEditingOptionValues([]);
    setNewOptionValueInput("");
  };

  const addOptionValueToEdit = () => {
    if (!newOptionValueInput.trim()) return;
    if (editingOptionValues.includes(newOptionValueInput.trim())) {
      toast.error("هذه القيمة موجودة بالفعل");
      return;
    }
    setEditingOptionValues([...editingOptionValues, newOptionValueInput.trim()]);
    setNewOptionValueInput("");
  };

  const removeOptionValueFromEdit = (valueIndex: number) => {
    setEditingOptionValues(editingOptionValues.filter((_, i) => i !== valueIndex));
  };

  const updateOptionValueInEdit = (valueIndex: number, newValue: string) => {
    const updated = [...editingOptionValues];
    updated[valueIndex] = newValue;
    setEditingOptionValues(updated);
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
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        category_id: formData.category_id || null,
        stock: parseInt(formData.stock),
        image_url: formData.image_url || null,
        gallery_images: formData.gallery_images,
        attributes: JSON.parse(JSON.stringify({ 
          // Shopify-style options and variants
          options: formData.options,
          variants: formData.variants,
          sku: formData.sku || undefined,
          barcode: formData.barcode || undefined,
          vendor: formData.vendor || undefined,
          product_type: formData.product_type || undefined,
          tags: formData.tags || undefined,
          compare_at_price: formData.compare_at_price ? parseFloat(formData.compare_at_price) : undefined,
          weight: formData.weight || undefined,
          weight_unit: formData.weight_unit || undefined,
          requires_shipping: formData.requires_shipping,
          seo_title: formData.seo_title || undefined,
          seo_description: formData.seo_description || undefined,
          handle: formData.handle || undefined,
        })),
        is_active: formData.is_active,
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            if (!workspaceId) return;
            setSyncingAll(true);
            try {
              const { data, error } = await supabase.functions.invoke('shopify-sync', {
                body: { action: 'sync_products_from_shopify', workspaceId }
              });
              if (error) throw error;
              if (data.success) {
                toast.success(`تم استيراد ${data.synced} منتج من Shopify`);
                fetchProducts();
              }
            } catch (err: any) {
              toast.error(err.message || 'فشل استيراد المنتجات');
            } finally {
              setSyncingAll(false);
            }
          }} disabled={syncingAll}>
            {syncingAll ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <ShoppingBag className="w-4 h-4 ml-2" />}
            استيراد من Shopify
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة منتج
          </Button>
        </div>
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
                    <p className="text-2xl font-bold text-primary">{product.price} ₪</p>
                    {product.min_negotiable_price && (
                      <p className="text-xs text-muted-foreground">
                        الحد الأدنى للتفاوض: {product.min_negotiable_price} ₪
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
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}
            </DialogTitle>
            <DialogDescription>
              أدخل معلومات المنتج أدناه
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-4">
              <TabsTrigger value="basic" className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">معلومات أساسية</span>
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                <span className="hidden sm:inline">الصور</span>
              </TabsTrigger>
              <TabsTrigger value="pricing" className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">التسعير</span>
              </TabsTrigger>
              <TabsTrigger value="inventory" className="flex items-center gap-1">
                <Package2 className="w-4 h-4" />
                <span className="hidden sm:inline">المخزون</span>
              </TabsTrigger>
              <TabsTrigger value="shipping" className="flex items-center gap-1">
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">الشحن</span>
              </TabsTrigger>
              <TabsTrigger value="variants" className="flex items-center gap-1">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">المتغيرات</span>
              </TabsTrigger>
            </TabsList>

            {/* Basic Information Tab */}
            <TabsContent value="basic" className="space-y-4">
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
                  rows={6}
                />
                {formErrors.description && (
                  <p className="text-sm text-destructive">{formErrors.description}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">تنظيم المنتج</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_type">نوع المنتج</Label>
                    <Input
                      id="product_type"
                      value={formData.product_type}
                      onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                      placeholder="مثال: زيوت طبيعية"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vendor">المورد</Label>
                    <Input
                      id="vendor"
                      value={formData.vendor}
                      onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                      placeholder="اسم المورد"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category_id">الفئات</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="tags">الوسوم</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="وسوم مفصولة بفواصل: طبيعي، عضوي، للبشرة"
                  />
                  <p className="text-xs text-muted-foreground">استخدم الفواصل لفصل الوسوم</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">معاينة محرك البحث</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="seo_title">عنوان الصفحة</Label>
                  <Input
                    id="seo_title"
                    value={formData.seo_title}
                    onChange={(e) => setFormData({ ...formData, seo_title: e.target.value })}
                    placeholder={formData.name || "عنوان الصفحة"}
                    maxLength={70}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.seo_title.length || formData.name.length}/70 حرف
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seo_description">الوصف التعريفي</Label>
                  <Textarea
                    id="seo_description"
                    value={formData.seo_description}
                    onChange={(e) => setFormData({ ...formData, seo_description: e.target.value })}
                    placeholder={formData.description || "وصف للمنتج"}
                    rows={3}
                    maxLength={320}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.seo_description.length || formData.description.length}/320 حرف
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="handle">رابط URL</Label>
                  <Input
                    id="handle"
                    value={formData.handle}
                    onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                    placeholder={formData.name.toLowerCase().replace(/\s+/g, '-') || "product-url"}
                  />
                  <p className="text-xs text-muted-foreground">يتم إنشاؤه تلقائياً من اسم المنتج</p>
                </div>
              </div>
            </TabsContent>

            {/* Media Tab */}
            <TabsContent value="media" className="space-y-4">

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
                  <div className="relative w-40 h-40 rounded-lg overflow-hidden border">
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
                    className="w-full h-32 border-dashed"
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
                <p className="text-xs text-muted-foreground">الصورة التي ستظهر في نتائج البحث والمتجر</p>
              </div>

              <Separator />

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
            </TabsContent>

            {/* Pricing Tab */}
            <TabsContent value="pricing" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="price">السعر *</Label>
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
                <Label htmlFor="compare_at_price">سعر المقارنة</Label>
                <Input
                  id="compare_at_price"
                  type="number"
                  step="0.01"
                  value={formData.compare_at_price}
                  onChange={(e) => setFormData({ ...formData, compare_at_price: e.target.value })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">يُستخدم لعرض السعر الأصلي المخفض</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="min_negotiable_price">الحد الأدنى للتفاوض (₪)</Label>
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

              <div className="space-y-2">
                <Label htmlFor="purchase_price">سعر الشراء (₪)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">اختياري - لحساب الأرباح لاحقاً</p>
              </div>
            </TabsContent>

            {/* Inventory Tab */}
            <TabsContent value="inventory" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="track_quantity">تتبع الكمية</Label>
                  <p className="text-xs text-muted-foreground">تتبع المخزون لهذا المنتج</p>
                </div>
                <Switch
                  id="track_quantity"
                  checked={formData.track_quantity}
                  onCheckedChange={(checked) => setFormData({ ...formData, track_quantity: checked })}
                />
              </div>

              {formData.track_quantity && (
                <div className="space-y-2">
                  <Label htmlFor="stock">الكمية المتوفرة *</Label>
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
              )}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="sku">SKU (رمز المنتج)</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="SKU-001"
                />
                <p className="text-xs text-muted-foreground">رمز تعريف المنتج الفريد</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="barcode">الباركود</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="1234567890123"
                />
                <p className="text-xs text-muted-foreground">رمز الباركود للمنتج</p>
              </div>
            </TabsContent>

            {/* Shipping Tab */}
            <TabsContent value="shipping" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requires_shipping">يتطلب الشحن</Label>
                  <p className="text-xs text-muted-foreground">هل يحتاج هذا المنتج للشحن؟</p>
                </div>
                <Switch
                  id="requires_shipping"
                  checked={formData.requires_shipping}
                  onCheckedChange={(checked) => setFormData({ ...formData, requires_shipping: checked })}
                />
              </div>

              {formData.requires_shipping && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight">الوزن</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.01"
                        value={formData.weight}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weight_unit">الوحدة</Label>
                      <Select 
                        value={formData.weight_unit} 
                        onValueChange={(value) => setFormData({ ...formData, weight_unit: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">كيلوغرام (kg)</SelectItem>
                          <SelectItem value="g">غرام (g)</SelectItem>
                          <SelectItem value="lb">رطل (lb)</SelectItem>
                          <SelectItem value="oz">أونصة (oz)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Variants Tab - Shopify Style */}
            <TabsContent value="variants" className="space-y-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Variants</h3>
                </div>

                {/* Options Section - Shopify Style */}
                <div className="space-y-4">
                  {/* Display options as buttons/pills */}
                  {formData.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="space-y-2">
                      {/* Option name as label */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{option.name}</span>
                        {editingOptionIndex !== optionIndex && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => startEditingOption(optionIndex)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                      
                      {/* Option values as buttons/pills */}
                      {editingOptionIndex !== optionIndex && option.values.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {option.values.map((val, valIndex) => (
                            <Button
                              key={valIndex}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                            >
                              {val.value}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Editing mode - Shopify style */}
                      {editingOptionIndex === optionIndex && (
                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="space-y-2">
                            <Label className="text-xs">Option name</Label>
                            <Input
                              value={editingOptionName}
                              onChange={(e) => setEditingOptionName(e.target.value)}
                              placeholder="e.g., Size, Color"
                              className="h-8"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs">Option values</Label>
                            <div className="space-y-2">
                              {editingOptionValues.map((value, valIndex) => (
                                <div key={valIndex} className="flex items-center gap-2">
                                  <Input
                                    value={value}
                                    onChange={(e) => updateOptionValueInEdit(valIndex, e.target.value)}
                                    className="h-8 flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => removeOptionValueFromEdit(valIndex)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                              <Input
                                value={newOptionValueInput}
                                onChange={(e) => setNewOptionValueInput(e.target.value)}
                                placeholder="Add another value"
                                className="h-8"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addOptionValueToEdit();
                                  }
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                removeOption(optionIndex);
                                cancelOptionEdit();
                              }}
                            >
                              Delete
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={saveOptionEdit}
                            >
                              Done
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add another option */}
                  {formData.options.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (newOptionName.trim()) {
                          addOption();
                          setNewOptionName("");
                        }
                      }}
                      disabled={!newOptionName.trim()}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 ml-2" />
                      Add another option
                    </Button>
                  )}
                  
                  {formData.options.length < 3 && (
                    <Input
                      value={newOptionName}
                      onChange={(e) => setNewOptionName(e.target.value)}
                      placeholder="Option name"
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOptionName.trim()) {
                          e.preventDefault();
                          addOption();
                          setNewOptionName("");
                        }
                      }}
                    />
                  )}
                </div>

                <Separator />

                {/* Variants Table - Shopify Style */}
                {formData.variants.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Select value={groupByOption} onValueChange={setGroupByOption}>
                          <SelectTrigger className="w-40 h-8">
                            <SelectValue placeholder="Group by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {formData.options.map((opt, idx) => (
                              <SelectItem key={idx} value={opt.name}>{opt.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={expandAll}
                            onChange={(e) => {
                              setExpandAll(e.target.checked);
                              if (e.target.checked) {
                                const allGroups = new Set<string>();
                                formData.variants.forEach(v => {
                                  const groupKey = groupByOption === formData.options[0]?.name ? v.option1 :
                                                  groupByOption === formData.options[1]?.name ? v.option2 :
                                                  groupByOption === formData.options[2]?.name ? v.option3 : '';
                                  if (groupKey) allGroups.add(groupKey);
                                });
                                setExpandedGroups(allGroups);
                              } else {
                                setExpandedGroups(new Set());
                              }
                            }}
                            className="rounded"
                          />
                          <Label className="text-xs cursor-pointer">Variant · {expandAll ? 'Collapse all' : 'Expand all'}</Label>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                          <tr>
                            <th className="px-3 py-2 text-right font-medium w-10">
                              <input type="checkbox" className="rounded" onChange={() => {}} />
                            </th>
                            <th className="px-3 py-2 text-right font-medium">Variant</th>
                            <th className="px-3 py-2 text-right font-medium">Price</th>
                            <th className="px-3 py-2 text-right font-medium">Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            if (!groupByOption) {
                              // No grouping - show all variants
                              return formData.variants.map((variant, idx) => {
                                const variantTitle = [
                                  variant.option1,
                                  variant.option2,
                                  variant.option3,
                                ].filter(Boolean).join(' / ') || 'Default';
                                
                                return (
                                  <tr key={variant.id || idx} className="border-t hover:bg-muted/50">
                                    <td className="px-3 py-2">
                                      <input type="checkbox" className="rounded" onChange={() => {}} />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <Tags className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">{variantTitle}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={variant.price?.toString() || formData.price || "0.00"}
                                        onChange={(e) => updateVariant(variant.id!, {
                                          price: e.target.value ? parseFloat(e.target.value) : undefined
                                        })}
                                        className="h-8 w-24"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="number"
                                        value={variant.inventory_quantity?.toString() || "0"}
                                        onChange={(e) => updateVariant(variant.id!, {
                                          inventory_quantity: e.target.value ? parseInt(e.target.value) : 0
                                        })}
                                        className="h-8 w-20"
                                      />
                                    </td>
                                  </tr>
                                );
                              });
                            } else {
                              // Group variants by selected option
                              const optionIndex = formData.options.findIndex(opt => opt.name === groupByOption);
                              if (optionIndex === -1) return null;
                              
                              const grouped: Record<string, ProductVariant[]> = {};
                              formData.variants.forEach(v => {
                                const groupKey = optionIndex === 0 ? v.option1 :
                                                optionIndex === 1 ? v.option2 :
                                                optionIndex === 2 ? v.option3 : '';
                                if (groupKey) {
                                  if (!grouped[groupKey]) grouped[groupKey] = [];
                                  grouped[groupKey].push(v);
                                }
                              });

                              const rows: React.ReactElement[] = [];
                              Object.entries(grouped).forEach(([groupKey, variants]) => {
                                const isExpanded = expandedGroups.has(groupKey);
                                
                                // Group header row
                                rows.push(
                                  <tr key={`group-${groupKey}`} className="border-t hover:bg-muted/50">
                                    <td className="px-3 py-2">
                                      <input type="checkbox" className="rounded" onChange={() => {}} />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => {
                                            const newExpanded = new Set(expandedGroups);
                                            if (isExpanded) {
                                              newExpanded.delete(groupKey);
                                            } else {
                                              newExpanded.add(groupKey);
                                            }
                                            setExpandedGroups(newExpanded);
                                          }}
                                        >
                                          {isExpanded ? '↑' : '↓'}
                                        </Button>
                                        <Tags className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">{groupKey}</span>
                                        <span className="text-xs text-muted-foreground">({variants.length} variants)</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={variants[0]?.price?.toString() || formData.price || "0.00"}
                                        onChange={(e) => {
                                          const price = e.target.value ? parseFloat(e.target.value) : undefined;
                                          variants.forEach(v => updateVariant(v.id!, { price }));
                                        }}
                                        className="h-8 w-24"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="number"
                                        value={variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0).toString()}
                                        onChange={(e) => {
                                          const total = e.target.value ? parseInt(e.target.value) : 0;
                                          const perVariant = Math.floor(total / variants.length);
                                          variants.forEach(v => updateVariant(v.id!, { inventory_quantity: perVariant }));
                                        }}
                                        className="h-8 w-20"
                                      />
                                    </td>
                                  </tr>
                                );

                                // Variant rows (if expanded)
                                if (isExpanded) {
                                  variants.forEach((variant, idx) => {
                                    const variantTitle = [
                                      variant.option1,
                                      variant.option2,
                                      variant.option3,
                                    ].filter(Boolean).join(' / ') || 'Default';
                                    
                                    rows.push(
                                      <tr key={variant.id || idx} className="border-t hover:bg-muted/30">
                                        <td className="px-3 py-2">
                                          <input type="checkbox" className="rounded" onChange={() => {}} />
                                        </td>
                                        <td className="px-3 py-2 pl-8">
                                          <div className="flex items-center gap-2">
                                            <Tags className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm">{variantTitle}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={variant.price?.toString() || formData.price || "0.00"}
                                            onChange={(e) => updateVariant(variant.id!, {
                                              price: e.target.value ? parseFloat(e.target.value) : undefined
                                            })}
                                            className="h-8 w-24"
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            value={variant.inventory_quantity?.toString() || "0"}
                                            onChange={(e) => updateVariant(variant.id!, {
                                              inventory_quantity: e.target.value ? parseInt(e.target.value) : 0
                                            })}
                                            className="h-8 w-20"
                                          />
                                        </td>
                                      </tr>
                                    );
                                  });
                                }
                              });

                              return rows;
                            }
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* Total inventory footer */}
                    <div className="text-xs text-muted-foreground">
                      Total inventory: {formData.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)} available
                    </div>
                  </div>
                )}

                {formData.options.length === 0 && (
                  <div className="p-6 rounded-lg border border-dashed text-center text-muted-foreground">
                    <Package2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Add options to create variants automatically</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="is_active">حالة المنتج</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <span className="text-sm text-muted-foreground">
                {formData.is_active ? "نشط" : "مسودة"}
              </span>
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
