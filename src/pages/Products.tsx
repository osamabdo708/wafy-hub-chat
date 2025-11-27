import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package } from "lucide-react";

const mockProducts = [
  {
    id: 1,
    name: "منتج العناية بالبشرة",
    category: "عناية شخصية",
    price: "150 ريال",
    stock: 45,
    image: "https://images.unsplash.com/photo-1556228578-dd6c8c6d3e8e?w=400"
  },
  {
    id: 2,
    name: "زيت الأرغان الطبيعي",
    category: "زيوت طبيعية",
    price: "120 ريال",
    stock: 30,
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400"
  },
  {
    id: 3,
    name: "ماسك الطين",
    category: "عناية بالوجه",
    price: "80 ريال",
    stock: 60,
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400"
  }
];

const Products = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="text-muted-foreground mt-1">إدارة كتالوج المنتجات</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 ml-2" />
          إضافة منتج
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المنتجات</p>
              <h3 className="text-2xl font-bold mt-1">67</h3>
            </div>
            <Package className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">متوفر في المخزون</p>
              <h3 className="text-2xl font-bold mt-1 text-success">52</h3>
            </div>
            <Package className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">نفد من المخزون</p>
              <h3 className="text-2xl font-bold mt-1 text-destructive">15</h3>
            </div>
            <Package className="w-8 h-8 text-destructive" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockProducts.map((product) => (
          <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className="aspect-video bg-muted overflow-hidden">
              <img 
                src={product.image} 
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-lg mb-1">{product.name}</h3>
                  <Badge variant="secondary">{product.category}</Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4">
                <div>
                  <p className="text-2xl font-bold text-primary">{product.price}</p>
                  <p className="text-sm text-muted-foreground">
                    المخزون: {product.stock}
                  </p>
                </div>
                <Button variant="outline" size="sm">تعديل</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Products;
