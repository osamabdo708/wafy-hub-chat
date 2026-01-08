import { useState, useEffect } from 'react';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  selectedColor?: string;
  selectedAttributes?: Record<string, string>;
}

export interface CartState {
  items: CartItem[];
  storeId: string;
}

export const useStoreCart = (storeId: string) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    if (storeId) {
      const savedCart = localStorage.getItem(`cart_${storeId}`);
      if (savedCart) {
        try {
          setCart(JSON.parse(savedCart));
        } catch (e) {
          console.error('Error parsing cart:', e);
        }
      }
    }
  }, [storeId]);

  // Save cart to localStorage on change
  useEffect(() => {
    if (storeId) {
      localStorage.setItem(`cart_${storeId}`, JSON.stringify(cart));
    }
  }, [cart, storeId]);

  const addToCart = (item: CartItem) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(
        i => i.productId === item.productId && 
             i.selectedColor === item.selectedColor &&
             JSON.stringify(i.selectedAttributes) === JSON.stringify(item.selectedAttributes)
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += item.quantity;
        return updated;
      }

      return [...prev, item];
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart(prev => {
      const updated = [...prev];
      updated[index].quantity = quantity;
      return updated;
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalItems,
    getTotalPrice,
  };
};
