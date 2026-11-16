import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, _ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { ok: false, error: "POST method required" },
        { status: 405 },
      );
    }

    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");

    if (!accountId || !apiToken) {
      return Response.json(
        { ok: false, error: "Cloudflare secrets are missing in Supabase" },
        { status: 500 },
      );
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/qwen/qwen3.8-27b`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: "Reply with exactly this text: SHAVEUP_CLOUDFLARE_OK",
              },
            ],
            max_tokens: 40,
            temperature: 0,
          }),
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        console.error("Cloudflare connection test failed", response.status, result?.errors ?? []);
        return Response.json(
          {
            ok: false,
            error: "Cloudflare request failed",
            cloudflareStatus: response.status,
            details: result?.errors ?? [],
          },
          { status: 502 },
        );
      }

      return Response.json({
        ok: true,
        message: "Cloudflare connection successful",
        model: "@cf/qwen/qwen3.8-27b",
        answer: result?.result?.response ?? null,
      });
    } catch (error) {
      console.error("Cloudflare connection test error", error);
      return Response.json(
        { ok: false, error: "Could not connect to Cloudflare" },
        { status: 502 },
      );
    }
  }),
};