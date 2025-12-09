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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log('Fetching all users to clear their sessions...');

    // Get all users from auth.users
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Error listing users:', usersError);
      throw usersError;
    }

    console.log(`Found ${users.users.length} users`);

    let clearedCount = 0;
    let errorCount = 0;

    // Sign out each user globally
    for (const user of users.users) {
      try {
        const { error } = await supabase.auth.admin.signOut(user.id, 'global');
        if (error) {
          console.error(`Error signing out user ${user.id}:`, error);
          errorCount++;
        } else {
          console.log(`Cleared sessions for user: ${user.email}`);
          clearedCount++;
        }
      } catch (err) {
        console.error(`Exception signing out user ${user.id}:`, err);
        errorCount++;
      }
    }

    console.log(`Session clearing complete. Cleared: ${clearedCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        clearedCount,
        errorCount,
        totalUsers: users.users.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in clear-all-sessions function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
