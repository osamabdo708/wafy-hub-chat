import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to get the current user's workspace ID.
 * Works for both workspace owners and members.
 */
export const useWorkspace = () => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getWorkspace = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const id = await getWorkspaceIdForUser(user.id);
        setWorkspaceId(id);
      } catch (error) {
        console.error('Error fetching workspace:', error);
      } finally {
        setLoading(false);
      }
    };

    getWorkspace();
  }, []);

  return { workspaceId, loading };
};

/**
 * Standalone async function to get workspace ID for a user.
 * Checks workspace_members first, falls back to workspaces.owner_user_id.
 */
export const getWorkspaceIdForUser = async (userId: string): Promise<string | null> => {
  // Check workspace_members table
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (membership) {
    return membership.workspace_id;
  }

  // Fallback: check if user is a workspace owner (for backwards compatibility)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(1)
    .single();

  return workspace?.id || null;
};
