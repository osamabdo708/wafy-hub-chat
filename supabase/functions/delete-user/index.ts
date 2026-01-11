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

    console.log(`Starting deletion for user: ${userId}`);

    // Get the workspace first
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (workspaceError) {
      console.error('Error fetching workspace:', workspaceError);
    }

    if (workspace) {
      console.log(`Found workspace: ${workspace.id}`);

      // Delete all related data in order (respecting foreign keys)
      
      // 1. Get all conversations for this workspace
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspace.id);
      
      if (convError) {
        console.error('Error fetching conversations:', convError);
      }

      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        console.log(`Deleting data for ${conversationIds.length} conversations`);
        
        // Delete messages
        const { error: msgError } = await supabase.from('messages').delete().in('conversation_id', conversationIds);
        if (msgError) console.error('Error deleting messages:', msgError);
        else console.log('Messages deleted');
        
        // Delete internal notes
        const { error: notesError } = await supabase.from('internal_notes').delete().in('conversation_id', conversationIds);
        if (notesError) console.error('Error deleting internal_notes:', notesError);
        else console.log('Internal notes deleted');
        
        // Delete AI processing locks
        const { error: locksError } = await supabase.from('ai_processing_locks').delete().in('conversation_id', conversationIds);
        if (locksError) console.error('Error deleting ai_processing_locks:', locksError);
        else console.log('AI processing locks deleted');
        
        // Delete orders linked to conversations
        const { error: ordersConvError } = await supabase.from('orders').delete().in('conversation_id', conversationIds);
        if (ordersConvError) console.error('Error deleting conversation orders:', ordersConvError);
        else console.log('Conversation orders deleted');
      }

      // 2. Delete conversations
      const { error: convDelError } = await supabase.from('conversations').delete().eq('workspace_id', workspace.id);
      if (convDelError) console.error('Error deleting conversations:', convDelError);
      else console.log('Conversations deleted');

      // 3. Delete channel connections and their oauth tokens
      const { data: connections, error: connError } = await supabase
        .from('channel_connections')
        .select('id')
        .eq('workspace_id', workspace.id);
      
      if (connError) {
        console.error('Error fetching connections:', connError);
      }

      if (connections && connections.length > 0) {
        const connectionIds = connections.map(c => c.id);
        const { error: tokenError } = await supabase.from('oauth_tokens').delete().in('connection_id', connectionIds);
        if (tokenError) console.error('Error deleting oauth_tokens:', tokenError);
        else console.log('OAuth tokens deleted');
      }
      
      const { error: connDelError } = await supabase.from('channel_connections').delete().eq('workspace_id', workspace.id);
      if (connDelError) console.error('Error deleting channel_connections:', connDelError);
      else console.log('Channel connections deleted');

      // 4. Delete other workspace data
      const tablesToDelete = [
        'agents',
        'products',
        'categories',
        'services',
        'clients',
        'orders',
        'shipping_methods',
        'payment_settings',
        'channel_integrations',
        'audit_logs'
      ];

      for (const table of tablesToDelete) {
        const { error } = await supabase.from(table).delete().eq('workspace_id', workspace.id);
        if (error) console.error(`Error deleting ${table}:`, error);
        else console.log(`${table} deleted`);
      }

      // 5. Delete workspace
      const { error: wsDelError } = await supabase.from('workspaces').delete().eq('id', workspace.id);
      if (wsDelError) console.error('Error deleting workspace:', wsDelError);
      else console.log('Workspace deleted');
    } else {
      console.log('No workspace found for user');
    }

    // 6. Delete quick replies created by this user
    const { error: qrError } = await supabase.from('quick_replies').delete().eq('created_by', userId);
    if (qrError) console.error('Error deleting quick_replies:', qrError);
    else console.log('Quick replies deleted');

    // 7. Delete profile
    const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
    if (profileError) console.error('Error deleting profile:', profileError);
    else console.log('Profile deleted');

    // 8. Delete user roles
    const { error: rolesError } = await supabase.from('user_roles').delete().eq('user_id', userId);
    if (rolesError) console.error('Error deleting user_roles:', rolesError);
    else console.log('User roles deleted');

    // 9. Delete the auth user (this also invalidates all sessions)
    console.log('Attempting to delete auth user...');
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting auth user:', authError);
      return new Response(
        JSON.stringify({ 
          error: authError.message,
          details: 'Failed to delete auth user. There may be remaining data linked to this user.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user deleted successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'User and all related data deleted successfully' }),
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
