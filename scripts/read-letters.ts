// Try Add a letter's "Read the letter for me" on sample photos before switching it on (README, Reading a
// mailed letter). Each photo is prepared as the browser prepares one (turned upright, at most 1600px, metadata
// stripped; here with ffmpeg) and read with the same request transcribe-letter makes (_shared/read_letter.ts).
//
//   deno run --env-file=supabase/functions/.env --allow-env --allow-read=samples --allow-write=samples \
//     --allow-run=ffmpeg --allow-net=api.anthropic.com scripts/read-letters.ts samples
//
// ANTHROPIC_API_KEY comes from the env file (gitignored), never the command line. samples/ is gitignored too:
// children's letters never go in the repo. Writes samples/readings.json to compare against the photos.
import { checkPhoto } from "../supabase/functions/_shared/transcription.ts";
import { READING_MODEL, readingClient, readLetter } from "../supabase/functions/_shared/read_letter.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const folder = Deno.args[0] ?? "samples";
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY in supabase/functions/.env first (README, Reading a mailed letter).");
  Deno.exit(1);
}
const claude = readingClient(apiKey, Deno.env.get("ANTHROPIC_BASE_URL"));
// Claude Opus 5.5's price per million tokens, for the estimate below.
const PRICE = { input: 4, output: 20 };

const photos: string[] = [];
for await (const entry of Deno.readDir(folder)) {
  if (entry.isFile && /\.(jpe?g|png|webp|heic|heif)$/i.test(entry.name)) photos.push(entry.name);
}
photos.sort();
if (!photos.length) {
  console.error(`No photos in ${folder}/ (JPEG, PNG, WebP or HEIC).`);
  Deno.exit(1);
}
await Deno.mkdir(`${folder}/.prepared`, { recursive: true });

const results = [];
let cost = 0;
for (const name of photos) {
  const prepared = `${folder}/.prepared/${name.replace(/\.[^.]+$/, "")}.jpg`;
  // Upright (ffmpeg applies the photo's orientation), no larger than 1600px on its long edge, no metadata,
  // on white, as photo.ts makes it.
  const ffmpeg = await new Deno.Command("ffmpeg", {
    args: [
      "-y",
      "-loglevel",
      "error",
      "-i",
      `${folder}/${name}`,
      "-vf",
      "scale='if(gt(iw,ih),min(1600,iw),-2)':'if(gt(iw,ih),-2,min(1600,ih))'",
      "-map_metadata",
      "-1",
      "-q:v",
      "3",
      "-frames:v",
      "1",
      prepared,
    ],
  }).output();
  if (!ffmpeg.success) {
    console.log(`\n${name}: couldn't prepare it (${new TextDecoder().decode(ffmpeg.stderr).trim()})`);
    continue;
  }
  const jpeg = encodeBase64(await Deno.readFile(prepared));
  const problem = checkPhoto(jpeg);
  if (problem) {
    console.log(`\n${name}: ${problem}`);
    continue;
  }

  const started = Date.now();
  const result = await readLetter(claude, jpeg).catch((err) => ({ ok: false as const, error: String(err) }));
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n=== ${name} (${seconds}s)`);
  if (!result.ok) {
    console.log("No reading:", JSON.stringify(result));
    results.push({ photo: name, seconds, result });
    continue;
  }
  const dollars = (result.inputTokens * PRICE.input + result.outputTokens * PRICE.output) / 1e6;
  cost += dollars;
  const { reading } = result;
  console.log(`first name: ${reading.first_name ?? "-"} · age: ${reading.age ?? "-"} · town: ${reading.town ?? "-"}`);
  console.log(
    `legibility: ${reading.legibility} · read by ${result.model}` +
      ` · ${result.inputTokens} in / ${result.outputTokens} out · about $${dollars.toFixed(3)}`,
  );
  console.log("---\n" + reading.letter + "\n---");
  for (const item of reading.privacy) console.log(`not for the mailbag: "${item.text}" (${item.what})`);
  for (const concern of reading.photo_concerns) console.log(`photo: ${concern}`);
  if (reading.return_address) console.log(`return address: ${reading.return_address}`);
  if (reading.notes) console.log(`note: ${reading.notes}`);
  results.push({ photo: name, seconds, model: result.model, dollars, reading });
}

await Deno.writeTextFile(`${folder}/readings.json`, JSON.stringify(results, null, 2));
console.log(
  `\n${results.length} read with ${READING_MODEL}, about $${cost.toFixed(2)} in all. Saved ${folder}/readings.json.`,
);
