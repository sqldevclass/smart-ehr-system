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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { token, password } = await req.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: "token and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: Validate token
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, email, full_name, role_codes, phone, hospital_id, status, token_expires_at")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invitation link" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invitation.status !== "pending") {
      return new Response(
        JSON.stringify({
          error: invitation.status === "accepted"
            ? "This invitation has already been accepted"
            : "This invitation is no longer valid",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invitation.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invitation link has expired. Please ask your administrator to send a new invitation." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: invitation.full_name,
        hospital_id: invitation.hospital_id,
      },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: "Failed to create account", details: authError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // Step 3: Create profile (handle_new_user trigger may have already created it)
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", newUserId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: newUserId,
          hospital_id: invitation.hospital_id,
          full_name: invitation.full_name,
          phone: invitation.phone || null,
        });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({ error: "Account setup failed", details: profileError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 4: Insert user_roles for each role_code
    const roleCodes: string[] = invitation.role_codes || [];

    const { data: roles } = await supabaseAdmin
      .from("roles")
      .select("id, code")
      .in("code", roleCodes);

    if (roles && roles.length > 0) {
      const roleRows = roles.map((r: any) => ({
        user_id: newUserId,
        role_id: r.id,
        hospital_id: invitation.hospital_id,
        granted_by: invitation.hospital_id, // system grant
      }));

      const { error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .insert(roleRows);

      if (rolesError) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({ error: "Failed to assign roles", details: rolesError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 5: If physician role, create physicians record
    if (roleCodes.includes("physician")) {
      const { error: physicianError } = await supabaseAdmin
        .from("physicians")
        .insert({
          profile_id: newUserId,
          hospital_id: invitation.hospital_id,
          dashboard_type: "clinical",
        });

      if (physicianError) {
        console.error("Physician record failed:", physicianError.message);
        // Non-fatal — admin can fix via physician management page
      }
    }

    // Step 6: Mark invitation as accepted
    await supabaseAdmin
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        auth_user_id: newUserId,
      })
      .eq("token", token);

    return new Response(
      JSON.stringify({
        success: true,
        role_codes: roleCodes,
        hospital_id: invitation.hospital_id,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});