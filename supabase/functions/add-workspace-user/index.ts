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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the calling user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create anon client to verify the caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { workspace_id, email, password, full_name } = await req.json();

    if (!workspace_id || !email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller is the workspace owner
    const { data: workspace } = await adminClient
      .from('workspaces')
      .select('owner_user_id')
      .eq('id', workspace_id)
      .single();

    if (!workspace || workspace.owner_user_id !== callerUser.id) {
      return new Response(JSON.stringify({ error: 'ليس لديك صلاحية لإضافة مستخدمين' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create the new user using admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      if (createError.message?.includes('already been registered')) {
        return new Response(JSON.stringify({ error: 'هذا البريد الإلكتروني مسجل بالفعل' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw createError;
    }

    if (!newUser.user) {
      throw new Error('فشل في إنشاء المستخدم');
    }

    // Wait for profile trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update profile with email and name
    await adminClient
      .from('profiles')
      .update({ email, full_name })
      .eq('id', newUser.user.id);

    // Add user to workspace_members
    const { error: memberError } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id,
        user_id: newUser.user.id,
        role: 'member'
      });

    if (memberError) {
      console.error('Error adding member:', memberError);
      throw memberError;
    }

    console.log(`[ADD-USER] User ${email} added to workspace ${workspace_id}`);

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in add-workspace-user:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
