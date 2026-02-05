 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 Deno.serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     
     const supabase = createClient(supabaseUrl, supabaseServiceKey, {
       auth: {
         autoRefreshToken: false,
         persistSession: false,
       },
     });
 
     // Get auth token from header
     const authHeader = req.headers.get("authorization");
     if (!authHeader || !authHeader.startsWith("Bearer ")) {
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "Authorization token required",
           error_ar: "رمز التفويض مطلوب"
         }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Create authenticated client with user's token
     const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
       global: {
         headers: { Authorization: authHeader },
       },
       auth: {
         autoRefreshToken: false,
         persistSession: false,
       },
     });
 
     // Verify the token and get user
     const { data: { user }, error: userError } = await userSupabase.auth.getUser();
 
     if (userError || !user) {
       console.log("Invalid token:", userError?.message);
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "Invalid or expired token",
           error_ar: "رمز غير صالح أو منتهي الصلاحية"
         }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Get user's workspace
     const { data: workspace } = await supabase
       .from("workspaces")
       .select("id")
       .eq("owner_user_id", user.id)
       .single();
 
     if (!workspace) {
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "No workspace found for user",
           error_ar: "لم يتم العثور على مساحة عمل للمستخدم"
         }),
         { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Parse request body
     const body = await req.json();
     const { conversation_id, enabled } = body;
 
     if (!conversation_id) {
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "conversation_id is required",
           error_ar: "معرف المحادثة مطلوب"
         }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     if (typeof enabled !== "boolean") {
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "enabled must be a boolean",
           error_ar: "يجب أن تكون القيمة منطقية (true/false)"
         }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Verify conversation belongs to user's workspace
     const { data: conversation, error: convError } = await supabase
       .from("conversations")
       .select("id, workspace_id")
       .eq("id", conversation_id)
       .eq("workspace_id", workspace.id)
       .single();
 
     if (convError || !conversation) {
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "Conversation not found",
           error_ar: "المحادثة غير موجودة"
         }),
         { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Update ai_enabled status
     const { error: updateError } = await supabase
       .from("conversations")
       .update({ ai_enabled: enabled })
       .eq("id", conversation_id);
 
     if (updateError) {
       console.error("Error updating conversation:", updateError);
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "Failed to update Mared status",
           error_ar: "فشل في تحديث حالة المارد"
         }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // If enabled, trigger auto-reply for any pending messages
     if (enabled) {
       try {
         await fetch(`${supabaseUrl}/functions/v1/auto-reply-messages`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             "Authorization": `Bearer ${supabaseServiceKey}`,
           },
           body: JSON.stringify({ conversationId: conversation_id }),
         });
         console.log("Triggered auto-reply for conversation:", conversation_id);
       } catch (autoReplyError) {
         console.error("Error triggering auto-reply:", autoReplyError);
         // Don't fail the request, just log the error
       }
     }
 
     return new Response(
       JSON.stringify({
         success: true,
         data: {
           conversation_id,
           mared_enabled: enabled,
           message: enabled ? "المارد مفعل الآن" : "تم إيقاف المارد",
           message_en: enabled ? "Mared is now enabled" : "Mared is now disabled"
         }
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
 
   } catch (error) {
     console.error("Unexpected error:", error);
     return new Response(
       JSON.stringify({ 
         success: false,
         error: "Internal server error",
         error_ar: "خطأ داخلي في الخادم"
       }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });