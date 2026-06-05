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

    const { token, password } = await req.json();

    if (!token || !password) {
      return new Response(JSON.stringify({ error: "token and password are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, email, full_name, role_codes, phone, hospital_id, status, token_expires_at, employee_id")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return new Response(JSON.stringify({ error: "Invalid or expired invitation link" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (invitation.status !== "pending") {
      return new Response(JSON.stringify({ error: invitation.status === "accepted" ? "This invitation has already been accepted" : "This invitation is no longer valid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (new Date(invitation.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This invitation link has expired. Please ask your administrator to send a new one." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const roleCodes: string[] = invitation.role_codes || [];
    let newUserId: string;
    let isReactivation = false;

    // Detect re-activation: employee has an existing inactive profile
    if (invitation.employee_id) {
      const { data: employee } = await supabaseAdmin
        .from("employees")
        .select("profile_id")
        .eq("id", invitation.employee_id)
        .single();

      if (employee?.profile_id) {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, is_active")
          .eq("id", employee.profile_id)
          .single();

        if (existingProfile && !existingProfile.is_active) {
          isReactivation = true;
          newUserId = existingProfile.id;
        }
      }
    }

    if (isReactivation) {
      // Update password
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUser(newUserId!, { password });
      if (pwError) {
        return new Response(JSON.stringify({ error: "Failed to update password", details: pwError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Unban via REST API
      const unbanResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${newUserId}`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ban_duration: "none" }),
        }
      );
      if (!unbanResponse.ok) {
        const unbanErr = await unbanResponse.json();
        return new Response(
          JSON.stringify({ error: "Failed to restore access", details: unbanErr.message || unbanErr.msg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Re-activate profile
      await supabaseAdmin.from("profiles").update({ is_active: true }).eq("id", newUserId!);

    } else {
      // New user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: invitation.full_name, hospital_id: invitation.hospital_id },
      });

      if (authError) {
        return new Response(JSON.stringify({ error: "Failed to create account", details: authError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      newUserId = authData.user.id;

      const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id").eq("id", newUserId).maybeSingle();

      if (!existingProfile) {
        const { error: profileError } = await supabaseAdmin.from("profiles").insert({
          id: newUserId,
          hospital_id: invitation.hospital_id,
          full_name: invitation.full_name,
          phone: invitation.phone || null,
          is_active: true,
        });

        if (profileError) {
          await supabaseAdmin.auth.admin.deleteUser(newUserId);
          return new Response(JSON.stringify({ error: "Account setup failed", details: profileError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Assign roles — clear first then re-assign (handles re-activation cleanly)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId!).eq("hospital_id", invitation.hospital_id);

    const { data: roles } = await supabaseAdmin.from("roles").select("id, code").in("code", roleCodes);

    if (roles && roles.length > 0) {
      const { error: rolesError } = await supabaseAdmin.from("user_roles").insert(
        roles.map((r: any) => ({ user_id: newUserId, role_id: r.id, hospital_id: invitation.hospital_id, granted_by: null }))
      );

      if (rolesError) {
        if (!isReactivation) await supabaseAdmin.auth.admin.deleteUser(newUserId!);
        return new Response(JSON.stringify({ error: "Failed to assign roles", details: rolesError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Link employee
    if (invitation.employee_id) {
      await supabaseAdmin.from("employees").update({ profile_id: newUserId }).eq("id", invitation.employee_id).eq("hospital_id", invitation.hospital_id);
    }

    // Physician record — new users only
    if (!isReactivation && roleCodes.includes("physician") && invitation.employee_id) {
      const { data: existingPhysician } = await supabaseAdmin.from("physicians").select("id").eq("employee_id", invitation.employee_id).maybeSingle();

      if (!existingPhysician) {
        await supabaseAdmin.from("physicians").insert({
          profile_id: newUserId,
          hospital_id: invitation.hospital_id,
          dashboard_type: "clinical",
          employee_id: invitation.employee_id,
        });
      } else {
        await supabaseAdmin.from("physicians").update({ profile_id: newUserId }).eq("id", existingPhysician.id);
      }
    }

    // Mark invitation accepted
    await supabaseAdmin.from("staff_invitations").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      auth_user_id: newUserId,
    }).eq("token", token);

    return new Response(
      JSON.stringify({ success: true, role_codes: roleCodes, hospital_id: invitation.hospital_id, reactivated: isReactivation }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
