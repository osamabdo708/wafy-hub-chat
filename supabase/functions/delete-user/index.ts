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
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log(`Deleting user: ${userId}`);

    // Get the workspace first
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_user_id', userId)
      .single();

    if (workspace) {
      console.log(`Found workspace: ${workspace.id}`);

      // Delete all related data in order (respecting foreign keys)
      // 1. Delete messages for conversations in this workspace
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspace.id);
      
      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        await supabase.from('messages').delete().in('conversation_id', conversationIds);
        await supabase.from('internal_notes').delete().in('conversation_id', conversationIds);
        await supabase.from('orders').delete().in('conversation_id', conversationIds);
      }

      // 2. Delete conversations
      await supabase.from('conversations').delete().eq('workspace_id', workspace.id);

      // 3. Delete other workspace data
      await supabase.from('agents').delete().eq('workspace_id', workspace.id);
      await supabase.from('products').delete().eq('workspace_id', workspace.id);
      await supabase.from('services').delete().eq('workspace_id', workspace.id);
      await supabase.from('orders').delete().eq('workspace_id', workspace.id);
      await supabase.from('channel_integrations').delete().eq('workspace_id', workspace.id);
      await supabase.from('channel_connections').delete().eq('workspace_id', workspace.id);
      await supabase.from('audit_logs').delete().eq('workspace_id', workspace.id);

      // 4. Delete workspace
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      console.log('Workspace and related data deleted');
    }

    // 5. Delete profile
    await supabase.from('profiles').delete().eq('id', userId);
    console.log('Profile deleted');

    // 6. Delete user roles
    await supabase.from('user_roles').delete().eq('user_id', userId);
    console.log('User roles deleted');

    // 7. Delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting auth user:', authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user deleted successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-user function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
