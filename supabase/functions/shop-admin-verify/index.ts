import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeJson(value: string): Record<string, unknown> {
  const decoded = new TextDecoder().decode(
    base64UrlDecode(value)
  );

  const parsed = JSON.parse(decoded);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("Invalid token payload");
  }

  return parsed as Record<string, unknown>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function verifyToken(
  token: string,
  secret: string
): Promise<{
  shopId: string;
  adminId: string;
  expiresAt: string;
} | null> {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [
      encodedHeader,
      encodedPayload,
      encodedSignature,
    ] = parts;

    if (
      !encodedHeader ||
      !encodedPayload ||
      !encodedSignature
    ) {
      return null;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT"
    ) {
      return null;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );

    const signature = base64UrlDecode(encodedSignature);

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(signature),
      toArrayBuffer(
        new TextEncoder().encode(
          `${encodedHeader}.${encodedPayload}`
        )
      )
    );

    if (!validSignature) {
      return null;
    }

    const shopId = payload.shop_id;
    const adminId = payload.admin_id;
    const issuedAt = Number(payload.iat);
    const expiresAtSeconds = Number(payload.exp);
    const now = Math.floor(Date.now() / 1000);

    if (
      typeof shopId !== "string" ||
      typeof adminId !== "string" ||
      !shopId ||
      !adminId ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAtSeconds) ||
      issuedAt > now + 60 ||
      expiresAtSeconds <= now ||
      expiresAtSeconds <= issuedAt
    ) {
      return null;
    }

    return {
      shopId,
      adminId,
      expiresAt: new Date(
        expiresAtSeconds * 1000
      ).toISOString(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    let body: Record<string, unknown>;

    try {
      const parsedBody = await req.json();

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return jsonResponse({ ok: false });
      }

      body = parsedBody as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false });
    }

    const sessionToken =
      typeof body.sessionToken === "string"
        ? body.sessionToken.trim()
        : "";

    if (
      !sessionToken ||
      sessionToken.length > 4096
    ) {
      return jsonResponse({ ok: false });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    const sessionSecret = Deno.env.get(
      "SHOP_SESSION_SECRET"
    );

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !sessionSecret
    ) {
      throw new Error(
        "Server configuration is incomplete"
      );
    }

    if (sessionSecret.length < 32) {
      throw new Error(
        "SHOP_SESSION_SECRET must be at least 32 characters"
      );
    }

    const tokenData = await verifyToken(
      sessionToken,
      sessionSecret
    );

    if (!tokenData) {
      return jsonResponse({ ok: false });
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

    const { data: admin, error: adminError } =
      await adminClient
        .from("shop_admins")
        .select(
          "id, shop_id, full_name, phone, email, national_id, created_at"
        )
        .eq("id", tokenData.adminId)
        .eq("shop_id", tokenData.shopId)
        .maybeSingle();

    if (adminError) {
      console.error(
        "Admin session lookup failed:",
        adminError.message
      );

      throw new Error("Admin verification failed");
    }

    if (!admin) {
      return jsonResponse({ ok: false });
    }

    const { data: shop, error: shopError } =
      await adminClient
        .from("shops")
        .select("*")
        .eq("id", tokenData.shopId)
        .maybeSingle();

    if (shopError) {
      console.error(
        "Shop session lookup failed:",
        shopError.message
      );

      throw new Error("Shop verification failed");
    }

    if (!shop) {
      return jsonResponse({ ok: false });
    }

    return jsonResponse({
      ok: true,
      shop,
      admin,
      expiresAt: tokenData.expiresAt,
    });
  } catch (error) {
    console.error(
      "Shop admin verification error:",
      error
    );

    return jsonResponse(
      {
        ok: false,
        error: "تعذر التحقق من جلسة الدخول.",
      },
      500
    );
  }
});