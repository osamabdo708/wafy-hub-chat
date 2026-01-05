import { Search, Moon, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import genieLogo from "@/assets/genie-logo.png";
import { NotificationDropdown } from "@/components/NotificationDropdown";

export const Header = () => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="border-b border-border bg-[rgba(245,245,247,0.8)] dark:bg-background">
      <div className="px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <img src={genieLogo} alt="Genie Logo" className="w-12 h-12" />
            <div>
              <h1 className="text-2xl font-bold text-primary">المارد</h1>
              <p className="text-xs text-muted-foreground">منصة المحادثات الموحدة</p>
            </div>
          </div>
          
          <div className="relative w-96">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="بحث في المحادثات..."
              className="pr-10"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">تبديل الوضع</span>
          </Button>
          <NotificationDropdown />
        </div>
      </div>
    </header>
  );
};
