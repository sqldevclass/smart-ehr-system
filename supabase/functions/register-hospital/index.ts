import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      hospital_name,
      hospital_address,
      hospital_phone,
      hospital_email,
      admin_full_name,
      admin_email,
      admin_password,
    } = await req.json();

    // Input validation
    if (!hospital_name || !hospital_email || 
        !admin_full_name || !admin_email || !admin_password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    if (admin_password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    // Service role client — never exposed to frontend
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Step 1: Check hospital email not already registered
    const { data: existingHospital } = await supabaseAdmin
      .from("hospitals")
      .select("id")
      .eq("email", hospital_email)
      .maybeSingle();

    if (existingHospital) {
      return new Response(
        JSON.stringify({ error: "A hospital with this email already exists" }),
        { status: 409, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    // Step 2: Create hospital
    const { data: hospital, error: hospitalError } = await supabaseAdmin
      .from("hospitals")
      .insert({
        name: hospital_name,
        address: hospital_address,
        phone: hospital_phone,
        email: hospital_email,
        is_active: true,
      })
      .select("id")
      .single();

    if (hospitalError) {
      return new Response(
        JSON.stringify({ error: "Failed to create hospital", 
          details: hospitalError.message }),
        { status: 500, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    // Step 2.5: Bootstrap hospital — settings, sequences, default warehouses
    // Without this, the hospital cannot register a single patient
    // (sequence generator raises an exception with no matching row)
    // and pharmacy/inventory has nowhere to receive stock.
    const { error: settingsError } = await supabaseAdmin
      .from("hospital_settings")
      .insert({ hospital_id: hospital.id });

    const { error: sequencesError } = await supabaseAdmin
      .from("hospital_sequences")
      .insert([
        { hospital_id: hospital.id, sequence_type: "patient", prefix: "P" },
        { hospital_id: hospital.id, sequence_type: "hospitalization", prefix: "H" },
        { hospital_id: hospital.id, sequence_type: "invoice", prefix: "INV" },
        { hospital_id: hospital.id, sequence_type: "receipt", prefix: "RCP" },
      ]);

    const { data: warehouseTypes, error: warehouseTypesError } =
      await supabaseAdmin
        .from("warehouse_types")
        .select("id, code")
        .in("code", ["central_pharmacy", "general"]);

    let warehousesError: { message: string } | null = null;
    if (!warehouseTypesError && warehouseTypes) {
      const centralPharmacy = warehouseTypes.find(
        (w) => w.code === "central_pharmacy"
      );
      const general = warehouseTypes.find((w) => w.code === "general");

      const warehouseRows = [];
      if (centralPharmacy) {
        warehouseRows.push({
          hospital_id: hospital.id,
          warehouse_type_id: centralPharmacy.id,
          name: "Центральная аптека",
        });
      }
      if (general) {
        warehouseRows.push({
          hospital_id: hospital.id,
          warehouse_type_id: general.id,
          name: "Общий склад",
        });
      }

      if (warehouseRows.length > 0) {
        const { error } = await supabaseAdmin
          .from("warehouses")
          .insert(warehouseRows);
        warehousesError = error;
      }
    } else {
      warehousesError = warehouseTypesError;
    }

    if (settingsError || sequencesError || warehousesError) {
      // Roll back hospital creation — partial bootstrap is worse
      // than no hospital at all
      await supabaseAdmin.from("hospitals").delete().eq("id", hospital.id);

      return new Response(
        JSON.stringify({
          error: "Failed to bootstrap hospital",
          details:
            settingsError?.message ||
            sequencesError?.message ||
            warehousesError?.message,
        }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    // Step 3: Create admin auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true, // auto-confirm for now
        user_metadata: {
          role: "admin",
          full_name: admin_full_name,
          hospital_id: hospital.id,
        },
      });

    if (authError) {
      // Roll back hospital creation
      await supabaseAdmin
        .from("hospitals")
        .delete()
        .eq("id", hospital.id);

      return new Response(
        JSON.stringify({ error: "Failed to create admin user", 
          details: authError.message }),
        { status: 500, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    // Step 4: Verify profile was created by trigger
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, hospital_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      // Trigger failed — roll back both hospital and auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      await supabaseAdmin.from("hospitals").delete().eq("id", hospital.id);

      return new Response(
        JSON.stringify({ error: "Profile creation failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, 
          "Content-Type": "application/json" } }
      );
    }

    // Step 4.5: Assign admin role via user_roles
    // profiles has no role column — roles are assigned through the
    // user_roles junction table. Without this, the new admin would
    // have zero permissions (has_permission() checks user_roles).
    const { data: adminRole, error: adminRoleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("code", "admin")
      .single();

    if (adminRoleError || !adminRole) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      await supabaseAdmin.from("hospitals").delete().eq("id", hospital.id);

      return new Response(
        JSON.stringify({ error: "Admin role lookup failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    const { error: userRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role_id: adminRole.id,
        hospital_id: hospital.id,
      });

    if (userRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      await supabaseAdmin.from("hospitals").delete().eq("id", hospital.id);

      return new Response(
        JSON.stringify({
          error: "Admin role assignment failed. Please try again.",
          details: userRoleError.message,
        }),
        { status: 500, headers: { ...corsHeaders,
          "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Hospital registered successfully",
        hospital_id: hospital.id,
      }),
      { status: 201, headers: { ...corsHeaders, 
        "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, 
        "Content-Type": "application/json" } }
    );
  }
});