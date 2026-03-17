import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Env check:", { hasUrl: !!Deno.env.get("EVOLUTION_API_URL"), hasKey: !!Deno.env.get("EVOLUTION_API_KEY") });

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  if (!EVOLUTION_API_URL) {
    return new Response(
      JSON.stringify({ error: "EVOLUTION_API_URL is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  if (!EVOLUTION_API_KEY) {
    return new Response(
      JSON.stringify({ error: "EVOLUTION_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client with user's JWT for auth validation
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Admin client to bypass RLS for tenant lookup
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = claimsData.claims.sub as string;

  // Get user's tenant using admin client (bypasses RLS)
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  console.log("Tenant lookup:", { userId, roleData, roleError: roleError?.message });

  if (!roleData?.tenant_id) {
    return new Response(
      JSON.stringify({ error: "User has no tenant assigned" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tenantId = roleData.tenant_id;

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { action, instanceName } = body;

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    };

    const parseEvolutionResponse = async (response: Response, operation: string): Promise<any> => {
      const responseText = await response.text();
      const contentType = response.headers.get("content-type") || "unknown";

      let parsed: any = null;
      try {
        parsed = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsed = null;
      }

      if (!parsed) {
        const snippet = responseText.substring(0, 180).replace(/\s+/g, " ").trim();
        throw new Error(
          `Evolution API ${operation} invalid response [${response.status}] (${contentType}): ${snippet || "empty body"}`,
        );
      }

      if (!response.ok) {
        throw new Error(`Evolution API ${operation} failed [${response.status}]: ${JSON.stringify(parsed)}`);
      }

      return parsed;
    };

    const requestEvolution = async (
      path: string,
      init: RequestInit,
      operation: string,
    ): Promise<any> => {
      const primaryUrl = `${baseUrl}${path}`;
      const primaryRes = await fetch(primaryUrl, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers || {}),
        },
      });

      try {
        return await parseEvolutionResponse(primaryRes, operation);
      } catch (primaryError) {
        const retryable404 = primaryRes.status === 404;
        if (!retryable404) throw primaryError;

        const retryUrl = `${primaryUrl}${primaryUrl.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(EVOLUTION_API_KEY)}`;
        const retryRes = await fetch(retryUrl, {
          ...init,
          headers: {
            ...headers,
            ...(init.headers || {}),
          },
        });

        return await parseEvolutionResponse(retryRes, `${operation} (retry with query apikey)`);
      }
    };

    // Action: create instance
    if (action === "create_instance") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoData = await requestEvolution(
        "/instance/create",
        {
          method: "POST",
          body: JSON.stringify({
            instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        },
        "create_instance",
      );

      // Save instance to DB
      const { error: dbError } = await supabaseAdmin.from("whatsapp_instances").insert({
        tenant_id: tenantId,
        instance_name: instanceName,
        instance_id: evoData.instance?.instanceName || instanceName,
        status: "connecting",
        qr_code: evoData.qrcode?.base64 || null,
      });

      if (dbError) {
        console.error("DB insert error:", dbError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          instance: evoData.instance,
          qrcode: evoData.qrcode,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: get QR code
    if (action === "get_qrcode") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoData = await requestEvolution(
        `/instance/connect/${instanceName}`,
        {
          method: "GET",
        },
        "get_qrcode",
      );

      // Update QR in DB
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ qr_code: evoData.base64 || null, status: "connecting" })
        .eq("instance_name", instanceName)
        .eq("tenant_id", tenantId);

      return new Response(
        JSON.stringify({ success: true, qrcode: evoData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: check connection status
    if (action === "connection_status") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoData = await requestEvolution(
        `/instance/connectionState/${instanceName}`,
        {
          method: "GET",
        },
        "connection_status",
      );

      const isConnected = evoData.instance?.state === "open";
      const newStatus = isConnected ? "connected" : "connecting";

      // Update status in DB
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: newStatus })
        .eq("instance_name", instanceName)
        .eq("tenant_id", tenantId);

      return new Response(
        JSON.stringify({ success: true, state: evoData.instance?.state, connected: isConnected }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: list instances from DB
    if (action === "list_instances") {
      const { data: instances, error: listError } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (listError) {
        throw new Error(`DB list error: ${listError.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, instances: instances || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: delete instance
    if (action === "delete_instance") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from Evolution API
      try {
        await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers,
        });
      } catch (e) {
        console.error("Evolution delete error (non-fatal):", e);
      }

      // Delete from DB
      await supabaseAdmin
        .from("whatsapp_instances")
        .delete()
        .eq("instance_name", instanceName)
        .eq("tenant_id", tenantId);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Evolution API edge function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
