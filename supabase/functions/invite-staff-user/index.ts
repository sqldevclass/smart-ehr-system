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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL")!;

    if (!supabaseUrl || !serviceRoleKey || !anonKey || 
        !resendApiKey || !siteUrl) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Verify caller via Auth REST API
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

    // Service role client for admin operations
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin and get hospital_id
    const { data: callerProfile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role, hospital_id, full_name, id")
        .eq("id", userId)
        .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    if (callerProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can invite staff" }),
        { status: 403, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    if (!callerProfile.hospital_id) {
      return new Response(
        JSON.stringify({ error: "Admin has no hospital assigned" }),
        { status: 403, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const { email, full_name, role, specialization, phone } =
      await req.json();

    if (!email || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "email, full_name and role are required" }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const validRoles = [
      "admin", "physician", "warehouse_staff",
      "pharmacy_staff", "registrar",
    ];

    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid role. Must be one of: ${validRoles.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    if (role === "physician" && !specialization) {
      return new Response(
        JSON.stringify({ 
          error: "Specialization is required for physicians" 
        }),
        { status: 400, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate pending invitation
    const { data: existingInvitation } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, status")
      .eq("hospital_id", callerProfile.hospital_id)
      .eq("email", email)
      .maybeSingle();

    if (existingInvitation) {
      if (existingInvitation.status === "pending") {
        return new Response(
          JSON.stringify({ 
            error: "A pending invitation already exists for this email" 
          }),
          { status: 409, headers: { ...corsHeaders,
            "Content-Type": "application/json" } }
        );
      }
      if (existingInvitation.status === "accepted") {
        return new Response(
          JSON.stringify({ 
            error: "A user with this email already exists in your hospital" 
          }),
          { status: 409, headers: { ...corsHeaders,
            "Content-Type": "application/json" } }
        );
      }
    }

    // Generate token and expiry
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(
      Date.now() + 48 * 60 * 60 * 1000
    ).toISOString();

    // Record invitation with token
    const { error: invitationError } = await supabaseAdmin
      .from("staff_invitations")
      .upsert({
        hospital_id: callerProfile.hospital_id,
        invited_by: callerProfile.id,
        email,
        full_name,
        role,
        specialization: specialization || null,
        phone: phone || null,
        status: "pending",
        token,
        token_expires_at: tokenExpiresAt,
        invited_at: new Date().toISOString(),
      }, {
        onConflict: "hospital_id,email",
      });

    if (invitationError) {
      return new Response(
        JSON.stringify({ error: "Failed to record invitation",
          details: invitationError.message }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Send invite email via Resend
    const inviteUrl = `${siteUrl}/invite?token=${token}`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM")!,
        to: email,
        subject: "You have been invited to Medical Center Management System",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1A56A0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Medical Center Management System</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px 0;color:#1F2937;font-size:20px;font-weight:600;">You have been invited</h2>
              <p style="margin:0 0 16px 0;color:#4B5563;font-size:15px;line-height:1.6;">
                Hi ${full_name}, you have been invited to join your hospital's Medical Center Management System as a <strong>${role.replace("_", " ")}</strong>.
              </p>
              <p style="margin:0 0 32px 0;color:#4B5563;font-size:15px;line-height:1.6;">
                Click the button below to accept your invitation and set up your account. This link will expire in <strong>48 hours</strong>.
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
              <p style="margin:32px 0 0 0;color:#9CA3AF;font-size:13px;line-height:1.6;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0 0;color:#1A56A0;font-size:13px;word-break:break-all;">
                ${inviteUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#F9FAFB;padding:24px 40px;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;color:#9CA3AF;font-size:13px;line-height:1.6;">
                This is an automated message from the Medical Center Management System.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();
      console.error("Email send failed:", emailError);

      // Roll back invitation record
      await supabaseAdmin
        .from("staff_invitations")
        .delete()
        .eq("token", token);

      return new Response(
        JSON.stringify({ error: "Failed to send invitation email" }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitation sent to ${email}`,
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