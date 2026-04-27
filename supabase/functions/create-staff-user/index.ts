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

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const { token, password } = await req.json();

    // Input validation
    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: "token and password are required" }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ 
          error: "Password must be at least 8 characters" 
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Step 1: Validate token
    const { data: invitation, error: inviteError } =
      await supabaseAdmin
        .from("staff_invitations")
        .select(`
          id,
          email,
          full_name,
          role,
          specialization,
          phone,
          hospital_id,
          status,
          token_expires_at
        `)
        .eq("token", token)
        .single();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid or expired invitation link" 
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check status
    if (invitation.status !== "pending") {
      return new Response(
        JSON.stringify({ 
          error: invitation.status === "accepted"
            ? "This invitation has already been accepted"
            : "This invitation is no longer valid"
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 3: Check expiry
    if (new Date(invitation.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          error: "This invitation link has expired. Please ask your administrator to send a new invitation." 
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 4: Create auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: {
          role: invitation.role,
          full_name: invitation.full_name,
          hospital_id: invitation.hospital_id,
        },
      });

    if (authError) {
      console.error("Auth user creation failed:", authError.message);
      return new Response(
        JSON.stringify({ error: "Failed to create account",
          details: authError.message }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 5: Verify profile was created by trigger
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, role, hospital_id")
        .eq("id", authData.user.id)
        .single();

    if (profileError || !profile) {
      // Roll back auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ 
          error: "Account setup failed. Please try again." 
        }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 6: If physician, create physicians record
    if (invitation.role === "physician") {
      const { error: physicianError } = await supabaseAdmin
        .from("physicians")
        .insert({
          profile_id: authData.user.id,
          full_name: invitation.full_name,
          specialization: invitation.specialization,
          phone: invitation.phone || null,
          hospital_id: invitation.hospital_id,
        });

      if (physicianError) {
        console.error("Physician record failed:", physicianError.message);
        // Roll back auth user — profile cascades
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return new Response(
          JSON.stringify({ 
            error: "Account setup failed. Please try again." 
          }),
          { status: 500, headers: { ...corsHeaders,
            "Content-Type": "application/json" } }
        );
      }
    }

    // Step 7: Mark invitation as accepted
    const { error: updateError } = await supabaseAdmin
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        auth_user_id: authData.user.id,
      })
      .eq("token", token);

    if (updateError) {
      console.error("Invitation update failed:", updateError.message);
      // Don't roll back — user was created successfully
      // Admin can manually fix invitation status if needed
    }

    return new Response(
      JSON.stringify({
        success: true,
        role: invitation.role,
        hospital_id: invitation.hospital_id,
      }),
      { status: 201, headers: { ...corsHeaders,
        "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err.message);
    return new Response(
      JSON.stringify({ error: "Unexpected error",
        details: err.message }),
      { status: 500, headers: { ...corsHeaders,
        "Content-Type": "application/json" } }
    );
  }
});