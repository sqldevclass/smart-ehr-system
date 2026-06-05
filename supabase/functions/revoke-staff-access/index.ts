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
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("ANON_KEY")!;

    // Verify caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": authHeader, "apikey": anonKey },
    });

    if (!authResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await authResponse.json();
    const callerId = userData.id;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller profile — derive hospital_id server-side
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, hospital_id")
      .eq("id", callerId)
      .single();

    if (!callerProfile?.hospital_id) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller has admin role
    const { data: userRoleRows } = await supabaseAdmin
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", callerId)
      .eq("hospital_id", callerProfile.hospital_id);

    const isAdmin = (userRoleRows || []).some((r: any) => r.roles?.code === "admin");

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can revoke access" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (target_user_id === callerId) {
      return new Response(
        JSON.stringify({ error: "You cannot revoke your own access" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target belongs to same hospital
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, hospital_id, is_active")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetProfile.hospital_id !== callerProfile.hospital_id) {
      return new Response(
        JSON.stringify({ error: "User does not belong to your hospital" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "User access is already revoked" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Ban the auth user — prevents login immediately
    const { error: banError } = await supabaseAdmin.auth.admin.updateUser(
      target_user_id,
      { ban_duration: "876000h" } // 100 years = effectively permanent
    );

    if (banError) {
      return new Response(
        JSON.stringify({ error: "Failed to revoke access", details: banError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Mark profile as inactive — blocks RLS at DB level
    await supabaseAdmin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", target_user_id);

    // Step 3: Remove all roles — clean permission state
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", target_user_id)
      .eq("hospital_id", callerProfile.hospital_id);

    // Step 4: Revoke any pending invitations for this user
    await supabaseAdmin
      .from("staff_invitations")
      .update({ status: "revoked" })
      .eq("hospital_id", callerProfile.hospital_id)
      .eq("auth_user_id", target_user_id);

    return new Response(
      JSON.stringify({ success: true, message: "Access revoked successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
