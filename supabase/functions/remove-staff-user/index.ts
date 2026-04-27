import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("ANON_KEY")!;

    // Step 1: Verify user via Auth REST API
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "Authorization": authHeader,
        "apikey": anonKey,
      }
    });

    if (!authResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const userData = await authResponse.json();
    const userId = userData.id;

    // Step 2: Service role client for admin operations
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Step 3: Verify caller is admin
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, hospital_id, id")
      .eq("id", userId)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can remove staff" }),
        { status: 403, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 4: Parse request body
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Prevent admin from removing themselves
    if (target_user_id === userId) {
      return new Response(
        JSON.stringify({ error: "You cannot remove yourself" }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 5: Verify target belongs to same hospital
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("hospital_id, role")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    if (targetProfile.hospital_id !== callerProfile.hospital_id) {
      return new Response(
        JSON.stringify({ error: "User does not belong to your hospital" }),
        { status: 403, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 6: Mark invitation as revoked
    await supabaseAdmin
      .from("staff_invitations")
      .update({ status: "revoked" })
      .eq("auth_user_id", target_user_id)
      .eq("hospital_id", callerProfile.hospital_id);

    // Step 7: Delete auth user — cascades to profiles
    const { error: deleteError } = await supabaseAdmin.auth.admin
      .deleteUser(target_user_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to remove user",
          details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "User removed successfully",
      }),
      { status: 200, headers: { ...corsHeaders,
        "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error",
        details: err.message }),
      { status: 500, headers: { ...corsHeaders,
        "Content-Type": "application/json" } }
    );
  }
});