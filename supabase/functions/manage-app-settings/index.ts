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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, settings } = await req.json();

    if (action === 'get') {
      // Get all settings
      const { data, error } = await supabaseClient
        .from('app_settings')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;

      // Mask sensitive values for display
      const maskedData = data.map(setting => ({
        ...setting,
        display_value: setting.is_sensitive && setting.value 
          ? '••••••••' + (setting.value.length > 4 ? setting.value.slice(-4) : '')
          : setting.value
      }));

      return new Response(JSON.stringify({ settings: maskedData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      // Update multiple settings
      const updates = [];
      
      for (const [key, value] of Object.entries(settings)) {
        // Skip empty values for sensitive fields if they're just the mask
        if (typeof value === 'string' && value.startsWith('••••')) {
          continue;
        }

        const { error } = await supabaseClient
          .from('app_settings')
          .update({ value: value as string, updated_at: new Date().toISOString() })
          .eq('key', key);

        if (error) {
          console.error(`Error updating ${key}:`, error);
          updates.push({ key, success: false, error: error.message });
        } else {
          updates.push({ key, success: true });
        }
      }

      // Also update Supabase secrets for critical settings
      // Note: This requires the Supabase Management API in production
      console.log('Settings updated:', updates);

      return new Response(JSON.stringify({ success: true, updates }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_single') {
      // Get a single setting by key (for edge functions to use)
      const { key } = settings;
      
      const { data, error } = await supabaseClient
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ value: data?.value }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in manage-app-settings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
