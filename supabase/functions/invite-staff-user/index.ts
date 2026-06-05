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
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL")!;
    const emailFrom = Deno.env.get("EMAIL_FROM")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": authHeader, "apikey": anonKey },
    });

    if (!authResponse.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userData = await authResponse.json();
    const userId = userData.id;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, hospital_id")
      .eq("id", userId)
      .single();

    if (!callerProfile?.hospital_id) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: userRoleRows } = await supabaseAdmin
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", userId)
      .eq("hospital_id", callerProfile.hospital_id);

    const isAdmin = (userRoleRows || []).some((r: any) => r.roles?.code === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can invite staff" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { person_id, role_codes } = await req.json();

    if (!person_id) {
      return new Response(JSON.stringify({ error: "person_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!role_codes || !Array.isArray(role_codes) || role_codes.length === 0) {
      return new Response(JSON.stringify({ error: "role_codes[] is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Look up person — verify belongs to caller's hospital
    const { data: person, error: personError } = await supabaseAdmin
      .from("persons")
      .select("id, first_name, last_name, email, phone, hospital_id")
      .eq("id", person_id)
      .eq("hospital_id", callerProfile.hospital_id)
      .single();

    if (personError || !person) {
      return new Response(JSON.stringify({ error: "Person not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!person.email) {
      return new Response(JSON.stringify({ error: "Person has no email address. Ask HR to add one first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check employment status
    const { data: employment } = await supabaseAdmin
      .from("employments")
      .select("employment_status")
      .eq("person_id", person_id)
      .eq("hospital_id", callerProfile.hospital_id)
      .single();

    if (employment?.employment_status && employment.employment_status !== "active") {
      return new Response(JSON.stringify({ error: "Cannot invite an inactive employee. HR must re-activate them first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if person has a linked profile
    const { data: linkedProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, is_active")
      .eq("person_id", person_id)
      .maybeSingle();

    const isReactivation = !!linkedProfile;

    if (isReactivation && linkedProfile.is_active) {
      return new Response(JSON.stringify({ error: "This person already has an active system account" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabaseAdmin
      .from("staff_invitations")
      .select("id")
      .eq("hospital_id", callerProfile.hospital_id)
      .eq("person_id", person_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvitation) {
      return new Response(JSON.stringify({ error: "A pending invitation already exists for this person" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate role_codes
    const { data: validRoles } = await supabaseAdmin
      .from("roles")
      .select("code")
      .in("code", role_codes);

    const validCodes = (validRoles || []).map((r: any) => r.code);
    const invalidCodes = role_codes.filter((c: string) => !validCodes.includes(c));
    if (invalidCodes.length > 0) {
      return new Response(JSON.stringify({ error: `Invalid role codes: ${invalidCodes.join(", ")}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const full_name = `${person.first_name} ${person.last_name}`.trim();
    const email = person.email;
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: invitationError } = await supabaseAdmin
      .from("staff_invitations")
      .insert({
        hospital_id: callerProfile.hospital_id,
        invited_by: callerProfile.id,
        person_id: person.id,
        email,
        full_name,
        role_codes,
        phone: person.phone || null,
        status: "pending",
        token,
        token_expires_at: tokenExpiresAt,
        invited_at: new Date().toISOString(),
      });

    if (invitationError) {
      return new Response(JSON.stringify({ error: "Failed to record invitation", details: invitationError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const inviteUrl = `${siteUrl}/invite?token=${token}`;
    const rolesDisplay = role_codes.map((c: string) => c.replace(/_/g, " ")).join(", ");

    const subject = isReactivation
      ? "Your access has been restored — Medical Center Management System"
      : "You have been invited to Medical Center Management System";
    const headline = isReactivation ? "Your access has been restored" : "You have been invited";
    const bodyText = isReactivation
      ? `Hi ${full_name}, your access to the system has been restored as <strong>${rolesDisplay}</strong>. Click below to set a new password and log in.`
      : `Hi ${full_name}, you have been invited to join as <strong>${rolesDisplay}</strong>. Click below to accept your invitation.`;
    const buttonText = isReactivation ? "Restore Access" : "Accept Invitation";

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailFrom,
        to: email,
        subject,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;"><tr><td style="background-color:#1A56A0;padding:32px 40px;text-align:center;"><h1 style="margin:0;color:#ffffff;font-size:22px;">Medical Center Management System</h1></td></tr><tr><td style="padding:40px;"><h2 style="margin:0 0 16px 0;color:#1F2937;">${headline}</h2><p style="color:#4B5563;font-size:15px;line-height:1.6;">${bodyText}</p><p style="color:#4B5563;font-size:15px;line-height:1.6;">This link expires in <strong>48 hours</strong>.</p><table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center"><a href="${inviteUrl}" style="display:inline-block;background-color:#1A56A0;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:6px;">${buttonText}</a></td></tr></table><p style="margin:24px 0 0 0;color:#9CA3AF;font-size:13px;">Or copy this link: ${inviteUrl}</p></td></tr></table></td></tr></table></body></html>`,
      }),
    });

    if (!emailResponse.ok) {
      await supabaseAdmin.from("staff_invitations").delete().eq("token", token);
      return new Response(JSON.stringify({ error: "Failed to send invitation email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ success: true, message: `${isReactivation ? "Re-activation" : "Invitation"} sent to ${email}` }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
