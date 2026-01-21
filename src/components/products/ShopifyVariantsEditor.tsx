import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  ImageIcon, 
  Upload, 
  X,
  ChevronDown,
  ChevronUp,
  Package2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OptionValue {
  value: string;
  image_url?: string;
}

interface ProductOption {
  name: string;
  values: OptionValue[];
}

interface ProductVariant {
  id?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  price?: number;
  sku?: string;
  barcode?: string;
  inventory_quantity?: number;
  weight?: number;
  image_url?: string;
}

interface ShopifyVariantsEditorProps {
  options: ProductOption[];
  variants: ProductVariant[];
  basePrice: string;
  baseStock: string;
  onOptionsChange: (options: ProductOption[]) => void;
  onVariantsChange: (variants: ProductVariant[]) => void;
}

export const ShopifyVariantsEditor = ({
  options,
  variants,
  basePrice,
  baseStock,
  onOptionsChange,
  onVariantsChange,
}: ShopifyVariantsEditorProps) => {
  const [addingOption, setAddingOption] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValues, setNewOptionValues] = useState<string[]>([""]);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [uploadingVariantImage, setUploadingVariantImage] = useState<string | null>(null);
  const variantImageInputRef = useRef<HTMLInputElement>(null);
  const [selectedVariantForImage, setSelectedVariantForImage] = useState<string | null>(null);

  // Upload variant image
  const uploadVariantImage = async (file: File, variantId: string) => {
    try {
      setUploadingVariantImage(variantId);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/variants/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      // Update variant with new image
      const updatedVariants = variants.map(v => 
        v.id === variantId ? { ...v, image_url: data.publicUrl } : v
      );
      onVariantsChange(updatedVariants);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('Error uploading variant image:', error);
      toast.error('فشل رفع الصورة');
    } finally {
      setUploadingVariantImage(null);
    }
  };

  const handleVariantImageClick = (variantId: string) => {
    setSelectedVariantForImage(variantId);
    variantImageInputRef.current?.click();
  };

  const handleVariantImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVariantForImage) return;
    await uploadVariantImage(file, selectedVariantForImage);
    if (variantImageInputRef.current) {
      variantImageInputRef.current.value = '';
    }
  };

  const removeVariantImage = (variantId: string) => {
    const updatedVariants = variants.map(v => 
      v.id === variantId ? { ...v, image_url: undefined } : v
    );
    onVariantsChange(updatedVariants);
  };

  // Add new option value input
  const addNewOptionValueInput = () => {
    setNewOptionValues([...newOptionValues, ""]);
  };

  // Update option value in add form
  const updateNewOptionValue = (index: number, value: string) => {
    const updated = [...newOptionValues];
    updated[index] = value;
    setNewOptionValues(updated);
  };

  // Remove option value from add form
  const removeNewOptionValue = (index: number) => {
    if (newOptionValues.length === 1) return;
    setNewOptionValues(newOptionValues.filter((_, i) => i !== index));
  };

  // Save new option
  const saveNewOption = () => {
    if (!newOptionName.trim()) {
      toast.error("يرجى إدخال اسم الخيار");
      return;
    }
    
    const validValues = newOptionValues.filter(v => v.trim());
    if (validValues.length === 0) {
      toast.error("يرجى إدخال قيمة واحدة على الأقل");
      return;
    }

    if (options.length >= 3) {
      toast.error("يمكنك إضافة 3 خيارات كحد أقصى");
      return;
    }

    const newOption: ProductOption = {
      name: newOptionName.trim(),
      values: validValues.map(v => ({ value: v.trim() }))
    };

    const updatedOptions = [...options, newOption];
    onOptionsChange(updatedOptions);
    
    // Generate new variants
    generateVariantsFromOptions(updatedOptions);
    
    // Reset form
    setAddingOption(false);
    setNewOptionName("");
    setNewOptionValues([""]);
  };

  // Generate variants from options
  const generateVariantsFromOptions = (opts: ProductOption[]) => {
    const optionsWithValues = opts.filter(opt => opt.values.length > 0);
    
    if (optionsWithValues.length === 0) {
      onVariantsChange([]);
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
    
    // Create variants from combinations, preserving existing data
    const newVariants: ProductVariant[] = combinations.map((combo, idx) => {
      // Check if variant already exists
      const existing = variants.find(v => 
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
        price: basePrice ? parseFloat(basePrice) : undefined,
        inventory_quantity: parseInt(baseStock) || 0,
      };
    });
    
    onVariantsChange(newVariants);
  };

  // Remove option
  const removeOption = (index: number) => {
    const updatedOptions = options.filter((_, i) => i !== index);
    onOptionsChange(updatedOptions);
    generateVariantsFromOptions(updatedOptions);
  };

  // Update variant
  const updateVariant = (variantId: string, updates: Partial<ProductVariant>) => {
    const updatedVariants = variants.map(v => 
      v.id === variantId ? { ...v, ...updates } : v
    );
    onVariantsChange(updatedVariants);
  };

  // Add value to existing option
  const addValueToOption = (optionIndex: number, value: string) => {
    if (!value.trim()) return;
    
    const updatedOptions = [...options];
    const existingValues = updatedOptions[optionIndex].values.map(v => v.value.toLowerCase());
    
    if (existingValues.includes(value.toLowerCase())) {
      toast.error("هذه القيمة موجودة بالفعل");
      return;
    }
    
    updatedOptions[optionIndex].values.push({ value: value.trim() });
    onOptionsChange(updatedOptions);
    generateVariantsFromOptions(updatedOptions);
  };

  // Remove value from option
  const removeValueFromOption = (optionIndex: number, valueIndex: number) => {
    const updatedOptions = [...options];
    updatedOptions[optionIndex].values = updatedOptions[optionIndex].values.filter((_, i) => i !== valueIndex);
    
    // Remove option if no values left
    if (updatedOptions[optionIndex].values.length === 0) {
      updatedOptions.splice(optionIndex, 1);
    }
    
    onOptionsChange(updatedOptions);
    generateVariantsFromOptions(updatedOptions);
  };

  return (
    <div className="space-y-4">
      {/* Hidden file input for variant images */}
      <input
        ref={variantImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleVariantImageUpload}
        className="hidden"
      />

      <Card className="p-4">
        <h3 className="text-base font-semibold mb-4">المتغيرات</h3>

        {/* Options Section */}
        <div className="space-y-3">
          {options.map((option, optionIndex) => (
            <Card key={optionIndex} className="p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 text-muted-foreground mt-2">
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-3">
                  {/* Option name */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{option.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => removeOption(optionIndex)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {/* Option values as badges with delete */}
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((val, valIndex) => (
                      <Badge 
                        key={valIndex} 
                        variant="secondary" 
                        className="text-sm py-1 px-3 gap-1"
                      >
                        {val.value}
                        <button
                          type="button"
                          className="mr-1 hover:text-destructive"
                          onClick={() => removeValueFromOption(optionIndex, valIndex)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    
                    {/* Add value input */}
                    <AddValueInput onAdd={(value) => addValueToOption(optionIndex, value)} />
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Add Option Form */}
          {addingOption ? (
            <Card className="p-4 bg-muted/30 border-primary/20">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">اسم الخيار</Label>
                  <Input
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    placeholder="مثال: المقاس، اللون"
                    className="h-9"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">قيم الخيار</Label>
                  <div className="space-y-2">
                    {newOptionValues.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={value}
                          onChange={(e) => updateNewOptionValue(index, e.target.value)}
                          placeholder={index === 0 ? "مثال: صغير" : ""}
                          className="h-9"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNewOptionValueInput();
                            }
                          }}
                        />
                        {newOptionValues.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => removeNewOptionValue(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      onClick={addNewOptionValueInput}
                    >
                      <Plus className="w-4 h-4 ml-1" />
                      إضافة قيمة أخرى
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveNewOption}
                  >
                    تم
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingOption(false);
                      setNewOptionName("");
                      setNewOptionValues([""]);
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            options.length < 3 && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() => setAddingOption(true)}
              >
                <Plus className="w-4 h-4 ml-2" />
                {options.length === 0 ? "إضافة خيارات مثل المقاس أو اللون" : "إضافة خيار آخر"}
              </Button>
            )
          )}
        </div>

        {/* Variants Table - Shopify Style */}
        {variants.length > 0 && (
          <div className="mt-6">
            <Separator className="mb-4" />
            
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2.5 text-right font-medium w-16">الصورة</th>
                    <th className="px-3 py-2.5 text-right font-medium">المتغير</th>
                    <th className="px-3 py-2.5 text-right font-medium w-28">السعر</th>
                    <th className="px-3 py-2.5 text-right font-medium w-24">الكمية</th>
                    <th className="px-3 py-2.5 text-right font-medium w-28">SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant, idx) => {
                    const variantTitle = [
                      variant.option1,
                      variant.option2,
                      variant.option3,
                    ].filter(Boolean).join(' / ') || 'الافتراضي';
                    
                    return (
                      <tr key={variant.id || idx} className="border-t hover:bg-muted/30">
                        {/* Image cell */}
                        <td className="px-3 py-2">
                          {variant.image_url ? (
                            <div className="relative w-10 h-10 rounded overflow-hidden border group">
                              <img
                                src={variant.image_url}
                                alt={variantTitle}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                onClick={() => removeVariantImage(variant.id!)}
                              >
                                <X className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="w-10 h-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-colors"
                              onClick={() => handleVariantImageClick(variant.id!)}
                              disabled={uploadingVariantImage === variant.id}
                            >
                              {uploadingVariantImage === variant.id ? (
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </td>
                        
                        {/* Variant name */}
                        <td className="px-3 py-2">
                          <span className="text-sm font-medium">{variantTitle}</span>
                        </td>
                        
                        {/* Price */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={variant.price?.toString() || basePrice || "0"}
                            onChange={(e) => updateVariant(variant.id!, {
                              price: e.target.value ? parseFloat(e.target.value) : undefined
                            })}
                            className="h-8 w-full"
                          />
                        </td>
                        
                        {/* Quantity */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={variant.inventory_quantity?.toString() || "0"}
                            onChange={(e) => updateVariant(variant.id!, {
                              inventory_quantity: e.target.value ? parseInt(e.target.value) : 0
                            })}
                            className="h-8 w-full"
                          />
                        </td>
                        
                        {/* SKU */}
                        <td className="px-3 py-2">
                          <Input
                            value={variant.sku || ""}
                            onChange={(e) => updateVariant(variant.id!, {
                              sku: e.target.value
                            })}
                            placeholder="SKU"
                            className="h-8 w-full"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total inventory footer */}
            <div className="flex items-center justify-between text-sm text-muted-foreground mt-3 px-1">
              <span>إجمالي المتغيرات: {variants.length}</span>
              <span>إجمالي المخزون: {variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)} وحدة</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {options.length === 0 && !addingOption && (
          <Card className="p-8 text-center mt-4 border-dashed">
            <Package2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">أضف خيارات لإنشاء متغيرات المنتج</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              مثال: المقاس (صغير، وسط، كبير) أو اللون (أحمر، أزرق)
            </p>
          </Card>
        )}
      </Card>
    </div>
  );
};

// Small component for adding values inline
const AddValueInput = ({ onAdd }: { onAdd: (value: string) => void }) => {
  const [value, setValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  if (!isAdding) {
    return (
      <button
        type="button"
        className="h-7 px-2 text-xs text-primary hover:bg-primary/10 rounded border border-dashed border-primary/50 flex items-center gap-1"
        onClick={() => setIsAdding(true)}
      >
        <Plus className="w-3 h-3" />
        إضافة
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-24 text-xs"
        placeholder="قيمة جديدة"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim()) {
              onAdd(value.trim());
              setValue("");
            }
          }
          if (e.key === 'Escape') {
            setIsAdding(false);
            setValue("");
          }
        }}
        onBlur={() => {
          if (value.trim()) {
            onAdd(value.trim());
          }
          setIsAdding(false);
          setValue("");
        }}
      />
    </div>
  );
};

export default ShopifyVariantsEditor;
