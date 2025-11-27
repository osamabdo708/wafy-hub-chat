import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  ShoppingCart, 
  Package, 
  Briefcase, 
  BarChart3, 
  Settings,
  LogOut
} from "lucide-react";

const navItems = [
  { title: "البريد الوارد", url: "/inbox", icon: MessageSquare },
  { title: "الطلبات", url: "/orders", icon: ShoppingCart },
  { title: "المنتجات", url: "/products", icon: Package },
  { title: "الخدمات", url: "/services", icon: Briefcase },
  { title: "التقارير", url: "/reports", icon: BarChart3 },
  { title: "الإعدادات", url: "/settings", icon: Settings },
];

export const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <aside className="w-64 bg-card border-l border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold text-primary">OmniChat</h1>
        <p className="text-sm text-muted-foreground mt-1">منصة المحادثات الموحدة</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted transition-colors"
            activeClassName="bg-primary text-primary-foreground hover:bg-primary"
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.title}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
            أ
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">المدير</p>
            <p className="text-xs text-muted-foreground">admin@example.com</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </Button>
      </div>
    </aside>
  );
};
