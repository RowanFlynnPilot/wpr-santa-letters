// The one request that reads a letter's photo, shared by transcribe-letter (staff, from Add a letter) and
// scripts/read-letters.ts (trying it on sample letters before it's switched on), so the trial measures exactly
// what staff will get.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { betaJSONSchemaOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema";
import { type Reading, READING_PROMPT, READING_SCHEMA, tidyReading } from "./transcription.ts";

export { Anthropic };

export const READING_MODEL = "claude-opus-5-5";

export function readingClient(apiKey: string, baseURL?: string): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL,
    // A child's handwriting at high effort can take most of a minute; the function's own limit is longer.
    timeout: 120_000,
    maxRetries: 1,
  });
}

export type ReadResult =
  | { ok: true; reading: Reading; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; stopReason: string | null; category: string | null };

// `jpeg` is base64, already checked by checkPhoto().
export async function readLetter(claude: Anthropic, jpeg: string): Promise<ReadResult> {
  const message = await claude.beta.messages.parse({
    model: READING_MODEL,
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
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg } },
        { type: "text", text: "Read this letter." },
      ],
    }],
  });
  if (message.stop_reason !== "end_turn" || !message.parsed_output) {
    return { ok: false, stopReason: message.stop_reason, category: message.stop_details?.category ?? null };
  }
  return {
    ok: true,
    reading: tidyReading(message.parsed_output as Reading),
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
