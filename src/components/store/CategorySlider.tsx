import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
}

interface CategorySliderProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
}

export const CategorySlider = ({ categories, selectedCategory, onSelectCategory }: CategorySliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (categories.length === 0) return null;

  return (
    <div className="relative group">
      {/* Navigation Arrows */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg bg-white/90 dark:bg-card/90 backdrop-blur-sm"
        onClick={() => scroll('right')}
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg bg-white/90 dark:bg-card/90 backdrop-blur-sm"
        onClick={() => scroll('left')}
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* All Products */}
        <button
          onClick={() => onSelectCategory(null)}
          className={`flex-shrink-0 group/item transition-all duration-300 ${
            selectedCategory === null 
              ? 'scale-105' 
              : 'hover:scale-105'
          }`}
        >
          <div 
            className={`w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden relative shadow-md transition-all duration-300 ${
              selectedCategory === null 
                ? 'ring-4 ring-primary ring-offset-2' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Package className="w-12 h-12 text-white" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-3">
              <p className="text-white font-bold text-sm text-center truncate">الكل</p>
            </div>
          </div>
        </button>

        {/* Categories */}
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`flex-shrink-0 group/item transition-all duration-300 ${
              selectedCategory === category.id 
                ? 'scale-105' 
                : 'hover:scale-105'
            }`}
          >
            <div 
              className={`w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden relative shadow-md transition-all duration-300 ${
                selectedCategory === category.id 
                  ? 'ring-4 ring-primary ring-offset-2' 
                  : 'hover:shadow-xl'
              }`}
            >
              {category.image_url ? (
                <img 
                  src={category.image_url} 
                  alt={category.name}
                  className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/70 flex items-center justify-center">
                  <Package className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-3">
                <p className="text-white font-bold text-sm text-center truncate">{category.name}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
