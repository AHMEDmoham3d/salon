
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const { phone, email } = await req.json();

    const normalizedPhone = String(phone ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    if (!normalizedPhone || !normalizedEmail) {
      return new Response(
        JSON.stringify({ ok: false }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (normalizedPhone.length > 30 || normalizedEmail.length > 254) {
      return new Response(
        JSON.stringify({ ok: false }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete");
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: admin, error: adminError } = await adminClient
      .from("shop_admins")
      .select("*")
      .eq("phone", normalizedPhone)
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (adminError) {
      console.error("Shop admin lookup failed:", adminError.message);
      throw new Error("Login lookup failed");
    }

    if (!admin) {
      return new Response(
        JSON.stringify({ ok: false }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("*")
      .eq("id", admin.shop_id)
      .maybeSingle();

    if (shopError) {
      console.error("Shop lookup failed:", shopError.message);
      throw new Error("Shop lookup failed");
    }

    if (!shop) {
      return new Response(
        JSON.stringify({ ok: false }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        shop,
        admin,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Shop admin login error:", error);

    return new Response(
      JSON.stringify({
        error: "حدث خطأ أثناء تسجيل الدخول.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
