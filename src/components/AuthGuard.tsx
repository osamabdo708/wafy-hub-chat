import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(false);

  // NEW: detect current route to prevent redirect loops
  const location = useLocation();

  useEffect(() => {
    // Check initial auth state
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error || !session) {
        // Clear any stale session
        await supabase.auth.signOut();
        setAuthenticated(false);
        setLoading(false);
        return;
      }
      setAuthenticated(true);
      checkWorkspace(session.user.id);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setAuthenticated(!!session);
        if (session) {
          setTimeout(() => {
            checkWorkspace(session.user.id);
          }, 0);
        } else {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkWorkspace = async (userId: string) => {
    try {
      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", userId)
        .maybeSingle();

      // If there's an error (user doesn't exist in DB), sign out
      if (error) {
        console.error("Error checking workspace:", error);
        await supabase.auth.signOut();
        setAuthenticated(false);
        setHasWorkspace(false);
        setLoading(false);
        return;
      }

      setHasWorkspace(!!workspace);
    } catch (error) {
      console.error("Error checking workspace:", error);
      await supabase.auth.signOut();
      setAuthenticated(false);
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

  // Not logged in → redirect to auth
  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  // FIX: prevent redirect loop by allowing the onboarding page
  if (!hasWorkspace && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
