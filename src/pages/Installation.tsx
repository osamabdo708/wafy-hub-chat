import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Sparkles, User, Mail, Lock, Loader2, Shield } from "lucide-react";
import agentIcon from "@/assets/agent-icon.png";

const Installation = () => {
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleNextStep = () => {
    if (!workspaceName.trim()) {
      toast.error("يرجى إدخال اسم مساحة العمل");
      return;
    }
    setStep(2);
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }

    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);

    try {
      // 1. Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("فشل في إنشاء المستخدم");
      }

      // Wait a moment for the profile to be created by the trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. Create workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: workspaceName.trim(),
          owner_user_id: authData.user.id
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // 3. Create default المارد agent
      await supabase
        .from('agents')
        .insert({
          workspace_id: workspace.id,
          name: 'المارد',
          is_ai: true,
          is_system: true,
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/6740/6740992.png'
        });

      toast.success("تم تثبيت النظام بنجاح!");
      
      // Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      navigate("/inbox");
    } catch (error) {
      console.error('Error during installation:', error);
      toast.error(error instanceof Error ? error.message : "فشل في تثبيت النظام");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-lg p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <img src={agentIcon} alt="المارد" className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-center">تثبيت النظام</h1>
          <p className="text-muted-foreground text-center mt-2">
            مرحباً بك في معالج التثبيت
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              1
            </div>
            <span className="text-sm font-medium">مساحة العمل</span>
          </div>
          <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              2
            </div>
            <span className="text-sm font-medium">المستخدم</span>
          </div>
        </div>

        {step === 1 && (
          <>
            <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg mb-6">
              <Sparkles className="w-5 h-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                مساحة العمل هي المكان الذي ستدير فيه جميع محادثاتك وطلباتك
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="workspace-name" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  اسم مساحة العمل
                </Label>
                <Input
                  id="workspace-name"
                  type="text"
                  placeholder="مثال: شركتي، متجري، اسم المشروع"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleNextStep}
                disabled={!workspaceName.trim()}
              >
                التالي
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg mb-6">
              <Shield className="w-5 h-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                هذا الحساب سيكون المستخدم الوحيد للنظام
              </p>
            </div>

            <form onSubmit={handleInstall} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full-name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  الاسم الكامل
                </Label>
                <Input
                  id="full-name"
                  type="text"
                  placeholder="أدخل اسمك الكامل"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  كلمة المرور
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  تأكيد كلمة المرور
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  السابق
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading || !fullName.trim() || !email.trim() || !password.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      جاري التثبيت...
                    </>
                  ) : (
                    "تثبيت النظام"
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
};

export default Installation;
