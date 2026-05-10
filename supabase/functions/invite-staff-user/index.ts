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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL")!;
    const emailFrom = Deno.env.get("EMAIL_FROM")!;

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
    const userId = userData.id;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller profile — derive hospital_id server-side, never trust client
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, hospital_id, full_name")
      .eq("id", userId)
      .single();

    if (!callerProfile?.hospital_id) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check caller has admin role via user_roles junction table
    const { data: userRoleRows } = await supabaseAdmin
  .from("user_roles")
  .select("roles(code)")
  .eq("user_id", userId)
  .eq("hospital_id", callerProfile.hospital_id);

const isAdmin = (userRoleRows || []).some((r: any) => r.roles?.code === "admin");

if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can invite staff" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { email, full_name, role_codes, phone } = await req.json();

    if (!email || !full_name || !role_codes || !Array.isArray(role_codes) || role_codes.length === 0) {
      return new Response(
        JSON.stringify({ error: "email, full_name and role_codes[] are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate role_codes exist in roles table
    const { data: validRoles } = await supabaseAdmin
      .from("roles")
      .select("code")
      .in("code", role_codes);

    const validCodes = (validRoles || []).map((r: any) => r.code);
    const invalidCodes = role_codes.filter((c: string) => !validCodes.includes(c));

    if (invalidCodes.length > 0) {
      return new Response(
        JSON.stringify({ error: `Invalid role codes: ${invalidCodes.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate pending invitation
    const { data: existingInvitation } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, status")
      .eq("hospital_id", callerProfile.hospital_id)
      .eq("email", email)
      .maybeSingle();

    if (existingInvitation?.status === "pending") {
      return new Response(
        JSON.stringify({ error: "A pending invitation already exists for this email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (existingInvitation?.status === "accepted") {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists in your hospital" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate token
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Record invitation
    const { error: invitationError } = await supabaseAdmin
      .from("staff_invitations")
      .upsert({
        hospital_id: callerProfile.hospital_id,
        invited_by: callerProfile.id,
        email,
        full_name,
        role_codes,
        phone: phone || null,
        status: "pending",
        token,
        token_expires_at: tokenExpiresAt,
        invited_at: new Date().toISOString(),
      }, { onConflict: "hospital_id,email" });

    if (invitationError) {
      return new Response(
        JSON.stringify({ error: "Failed to record invitation", details: invitationError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend
    const inviteUrl = `${siteUrl}/invite?token=${token}`;
    const rolesDisplay = role_codes.map((c: string) => c.replace(/_/g, " ")).join(", ");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: email,
        subject: "You have been invited to Medical Center Management System",
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#1A56A0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;">Medical Center Management System</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px 0;color:#1F2937;">You have been invited</h2>
              <p style="color:#4B5563;font-size:15px;line-height:1.6;">
                Hi ${full_name}, you have been invited to join as <strong>${rolesDisplay}</strong>.
              </p>
              <p style="color:#4B5563;font-size:15px;line-height:1.6;">
                Click below to accept your invitation. This link expires in <strong>48 hours</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display:inline-block;background-color:#1A56A0;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;color:#9CA3AF;font-size:13px;">
                Or copy this link: ${inviteUrl}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      }),
    });

    if (!emailResponse.ok) {
      await supabaseAdmin.from("staff_invitations").delete().eq("token", token);
      return new Response(
        JSON.stringify({ error: "Failed to send invitation email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invitation sent to ${email}` }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});