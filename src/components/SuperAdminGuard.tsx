import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Super admin credentials - in production, these would be in environment variables
const SUPER_ADMIN_USERNAME = "superadmin";
const SUPER_ADMIN_PASSWORD = "superadmin";

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

export const SuperAdminGuard = ({ children }: SuperAdminGuardProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Check if super admin is already authenticated in this session
    const superAdminAuth = sessionStorage.getItem("superAdminAuth");
    if (superAdminAuth === "true") {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
      sessionStorage.setItem("superAdminAuth", "true");
      setIsAuthenticated(true);
      toast.success("تم تسجيل الدخول بنجاح");
    } else {
      toast.error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">لوحة تحكم المشرف</h1>
            <p className="text-muted-foreground mt-2">يرجى تسجيل الدخول للمتابعة</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full">
              <Lock className="w-4 h-4 ml-2" />
              تسجيل الدخول
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
