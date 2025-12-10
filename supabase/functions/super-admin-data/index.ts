import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    // Fetch all workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: false });

    if (workspacesError) {
      console.error('Error fetching workspaces:', workspacesError);
      throw workspacesError;
    }

    // Map workspaces with owner info
    const workspacesWithOwners = (workspaces || []).map(ws => {
      const owner = profiles?.find(p => p.id === ws.owner_user_id);
      return {
        ...ws,
        owner_email: owner?.email || 'غير معروف',
        owner_name: owner?.full_name || 'غير معروف'
      };
    });

    // Map users with workspace info
    const usersWithWorkspaces = (profiles || []).map(profile => {
      const workspace = workspaces?.find(w => w.owner_user_id === profile.id);
      return {
        id: profile.id,
        email: profile.email || '',
        full_name: profile.full_name || '',
        role: profile.role || 'agent',
        created_at: profile.created_at,
        workspace_id: workspace?.id || null,
        workspace_name: workspace?.name || null
      };
    });

    console.log(`[SUPER-ADMIN] Fetched ${profiles?.length || 0} users, ${workspaces?.length || 0} workspaces`);

    return new Response(
      JSON.stringify({ 
        users: usersWithWorkspaces, 
        workspaces: workspacesWithOwners 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in super-admin-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});