import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(false);

  useEffect(() => {
    // Check initial auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      if (session) {
        checkWorkspace(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthenticated(!!session);
      if (session) {
        setTimeout(() => {
          checkWorkspace(session.user.id);
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkWorkspace = async (userId: string) => {
    try {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', userId)
        .maybeSingle();

      setHasWorkspace(!!workspace);
    } catch (error) {
      console.error('Error checking workspace:', error);
      setHasWorkspace(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!hasWorkspace) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
