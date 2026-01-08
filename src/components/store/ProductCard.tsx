import { Package, ShoppingCart, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  image_url?: string;
}

interface ProductCardProps {
  product: Product;
  onViewProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
}

export const ProductCard = ({ product, onViewProduct, onAddToCart, onBuyNow }: ProductCardProps) => {
  return (
    <Card className="overflow-hidden group border-0 shadow-sm hover:shadow-xl transition-all duration-300 bg-card">
      {/* Image */}
      <div 
        className="aspect-square bg-muted overflow-hidden cursor-pointer relative"
        onClick={() => onViewProduct(product)}
      >
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Package className="w-16 h-16 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Stock Badge */}
        <div className="absolute top-3 right-3">
          {product.stock > 0 ? (
            <Badge className="bg-green-500/90 hover:bg-green-500/90 text-white border-0 shadow-md">
              متوفر
            </Badge>
          ) : (
            <Badge variant="destructive" className="shadow-md">
              نفذ
            </Badge>
          )}
        </div>

        {/* Quick Actions Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
          <Button 
            size="sm" 
            variant="secondary"
            className="bg-white/95 hover:bg-white text-foreground shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product);
            }}
            disabled={product.stock === 0}
          >
            <ShoppingCart className="w-4 h-4 ml-1" />
            أضف للسلة
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div 
          className="cursor-pointer"
          onClick={() => onViewProduct(product)}
        >
          <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {product.description}
            </p>
          )}
        </div>

        {/* Price & Actions */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xl font-bold text-primary">{product.price} ₪</p>
          
          <Button 
            size="sm"
            className="gap-1"
            onClick={() => onBuyNow(product)}
            disabled={product.stock === 0}
          >
            <Zap className="w-4 h-4" />
            اشتري الآن
          </Button>
        </div>
      </div>
    </Card>
  );
};
