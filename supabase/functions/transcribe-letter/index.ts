// POST { photo } from a staff browser (#/admin > Add a letter > Read the letter for me): the photo of a mailed
// letter, already made upright and 1600px by the browser (photo.ts), as base64 JPEG. Claude reads it and the
// page fills in the boxes: first name, age, town, the letter in the child's own spelling, and what in the
// letter or the photo shouldn't be published. Nothing is saved here; staff check the reading against the
// photo and add the letter as they would a typed one (CLAUDE.md, invariant 24).
//
// Only staff may call it (requireStaff). Without ANTHROPIC_API_KEY it reads nothing and says so; staff type
// the letter in. The photo goes to Anthropic's API and nowhere else; it isn't stored by this function, and
// neither the photo nor the reading is logged (invariant 11).

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { betaJSONSchemaOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { optionalEnv, requireEnv, requireNamedKey } from "../_shared/env.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { requireStaff } from "../_shared/staff.ts";
import { checkPhoto, type Reading, READING_PROMPT, READING_SCHEMA, tidyReading } from "../_shared/transcription.ts";

const supabase = createClient(requireEnv("SUPABASE_URL"), requireNamedKey("SUPABASE_SECRET_KEYS", "default"), {
  auth: { persistSession: false },
});
const apiKey = optionalEnv("ANTHROPIC_API_KEY");
const claude = apiKey
  ? new Anthropic({
    apiKey,
    baseURL: optionalEnv("ANTHROPIC_BASE_URL") ?? undefined,
    // A child's handwriting at high effort can take most of a minute; the function's own limit is longer.
    timeout: 120_000,
    maxRetries: 1,
  })
  : null;
if (!claude) console.warn("Reading letters is off: set ANTHROPIC_API_KEY to let staff read a mailed letter's photo.");

const OFF = "Reading letters from a photo isn’t switched on. Type this one in.";
const FAILED = "Claude couldn’t read this one. Type it in, or try a clearer photo.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const refused = await requireStaff(supabase, req);
    if (refused) return refused;
    if (!claude) return json({ error: OFF }, 503);

    const body = await req.json().catch(() => ({}));
    const problem = checkPhoto(body.photo);
    if (problem) return json({ error: problem }, 400);

    const message = await claude.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Handwriting is the hard part, and a letter is one call: worth the thought.
      output_config: { effort: "high", format: betaJSONSchemaOutputFormat(READING_SCHEMA) },
      // A declined reading is retried on Anthropic's recommended fallback model rather than returned.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: READING_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.photo } },
          { type: "text", text: "Read this letter." },
        ],
      }],
    });

    if (message.stop_reason !== "end_turn" || !message.parsed_output) {
      // The stop reason and the refusal's category only: never the words.
      console.error("transcribe-letter: no reading,", message.stop_reason, message.stop_details?.category ?? "");
      return json({ error: FAILED }, 502);
    }
    const { input_tokens, output_tokens } = message.usage;
    console.log(`transcribe-letter: read by ${message.model}, ${input_tokens} in, ${output_tokens} out`);
    return json({ reading: tidyReading(message.parsed_output as Reading) }, 200);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Claude is busy. Try again in a minute." }, 503);
    }
    if (err instanceof Anthropic.APIError) {
      // Status and type only: an API error can echo the request.
      console.error("transcribe-letter: Anthropic API error", err.status ?? "", err.constructor.name);
      return json({ error: FAILED }, 502);
    }
    // A database error's code and message only, as the other functions log.
    const { code, message } = err as { code?: string; message?: string };
    console.error("transcribe-letter failed:", code ?? "", message ?? String(err));
    return json({ error: FAILED }, 500);
  }
});
