import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import genieLogo from "@/assets/genie-logo.png";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingInstallation, setCheckingInstallation] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkInstallationStatus();
  }, []);

  const checkInstallationStatus = async () => {
    try {
      // Check if there's any user in the system
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('Error checking installation:', error);
        // If we can't check, assume not installed
        setIsInstalled(false);
        setCheckingInstallation(false);
        return;
      }

      const installed = (count || 0) > 0;
      setIsInstalled(installed);

      if (!installed) {
        // No user exists, redirect to installation
        navigate("/installation");
        return;
      }

      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/inbox");
      }
    } catch (error) {
      console.error('Error checking installation:', error);
    } finally {
      setCheckingInstallation(false);
    }
  };

  useEffect(() => {
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setTimeout(() => {
          navigate("/inbox");
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "خطأ في تسجيل الدخول",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم تسجيل الدخول بنجاح",
        description: "مرحباً بك في منصة OmniChat",
      });
    }

    setLoading(false);
  };

  if (checkingInstallation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 overflow-hidden">
            <img src={genieLogo} alt="المارد" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-center">المارد</h1>
          <p className="text-muted-foreground text-center mt-2">
            المنصة التجارية الذكية
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signin-email">البريد الإلكتروني</Label>
            <Input
              id="signin-email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signin-password">كلمة المرور</Label>
            <Input
              id="signin-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                جاري تسجيل الدخول...
              </>
            ) : (
              "تسجيل الدخول"
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Auth;
