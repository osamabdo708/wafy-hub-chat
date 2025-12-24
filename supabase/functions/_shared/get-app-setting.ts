import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cache for settings to reduce DB calls
const settingsCache: Record<string, { value: string; timestamp: number }> = {};
const CACHE_TTL = 60000; // 1 minute cache

export async function getAppSetting(key: string): Promise<string | null> {
  // Check cache first
  const cached = settingsCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      console.error(`Error fetching setting ${key}:`, error);
      // Fall back to environment variable
      return Deno.env.get(key) || null;
    }

    // Update cache
    if (data?.value) {
      settingsCache[key] = { value: data.value, timestamp: Date.now() };
    }

    // If no value in DB, fall back to env variable
    return data?.value || Deno.env.get(key) || null;
  } catch (error) {
    console.error(`Error in getAppSetting for ${key}:`, error);
    return Deno.env.get(key) || null;
  }
}

export async function getMultipleSettings(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('key, value')
      .in('key', keys);

    if (error) {
      console.error('Error fetching settings:', error);
      // Fall back to environment variables
      keys.forEach(key => {
        result[key] = Deno.env.get(key) || null;
      });
      return result;
    }

    // Build result from DB data
    const dbSettings: Record<string, string> = {};
    data?.forEach(item => {
      if (item.value) {
        dbSettings[item.key] = item.value;
        settingsCache[item.key] = { value: item.value, timestamp: Date.now() };
      }
    });

    // For each key, use DB value or fall back to env
    keys.forEach(key => {
      result[key] = dbSettings[key] || Deno.env.get(key) || null;
    });

    return result;
  } catch (error) {
    console.error('Error in getMultipleSettings:', error);
    keys.forEach(key => {
      result[key] = Deno.env.get(key) || null;
    });
    return result;
  }
}
