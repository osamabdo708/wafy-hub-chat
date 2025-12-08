import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Sparkles } from "lucide-react";
import agentIcon from "@/assets/agent-icon.png";

const Onboarding = () => {
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingWorkspace, setCheckingWorkspace] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkExistingWorkspace();
  }, []);

  const checkExistingWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      // Check if user already has a workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (workspace) {
        // User already has workspace, redirect to inbox
        navigate("/inbox");
        return;
      }
    } catch (error) {
      console.error('Error checking workspace:', error);
    } finally {
      setCheckingWorkspace(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceName.trim()) {
      toast.error("يرجى إدخال اسم مساحة العمل");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("يرجى تسجيل الدخول أولاً");
        navigate("/auth");
        return;
      }

      // Create workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: workspaceName.trim(),
          owner_user_id: user.id
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // Create default المارد agent for the workspace
      const { error: agentError } = await supabase
        .from('agents')
        .insert({
          workspace_id: workspace.id,
          name: 'المارد',
          is_ai: true,
          is_system: true,
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/6740/6740992.png'
        });

      if (agentError) {
        console.error('Error creating agent:', agentError);
        // Don't throw, workspace is created successfully
      }

      toast.success("تم إنشاء مساحة العمل بنجاح!");
      navigate("/inbox");
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast.error("فشل في إنشاء مساحة العمل");
    } finally {
      setLoading(false);
    }
  };

  if (checkingWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <img src={agentIcon} alt="المارد" className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-center">مرحباً بك في المارد</h1>
          <p className="text-muted-foreground text-center mt-2">
            لنبدأ بإنشاء مساحة العمل الخاصة بك
          </p>
        </div>

        <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg mb-6">
          <Sparkles className="w-5 h-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            مساحة العمل هي المكان الذي ستدير فيه جميع محادثاتك وطلباتك
          </p>
        </div>

        <form onSubmit={handleCreateWorkspace} className="space-y-6">
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
            <p className="text-xs text-muted-foreground">
              يمكنك تغيير هذا الاسم لاحقاً من الإعدادات
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !workspaceName.trim()}
          >
            {loading ? "جاري الإنشاء..." : "إنشاء مساحة العمل"}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Onboarding;
