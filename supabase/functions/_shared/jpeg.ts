import { BadRequest } from "./errors.ts";

const APP1 = 0xe1; // Exif and XMP — where phone GPS coordinates live.
const APP13 = 0xed; // IPTC / Photoshop — can also carry location.
const SOS = 0xda; // Start of scan: every metadata segment comes before this.

// Returns the JPEG with APP1 and APP13 segments removed. The browser already bakes
// orientation into the pixels when it re-encodes, so nothing here is needed for display.
// This is the guarantee that a family's home location never reaches public storage.
export function stripLocationMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new BadRequest("Photo must be a JPEG.");
  }

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new BadRequest("Photo is not a valid JPEG.");
    const marker = bytes[i + 1];

    if (marker === 0xff) { // fill byte
      i += 1;
      continue;
    }
    if (marker === SOS) {
      kept.push(bytes.subarray(i));
      return concat(kept);
    }
    if (i + 4 > bytes.length) throw new BadRequest("Photo is not a valid JPEG.");

    const segmentEnd = i + 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    if (segmentEnd > bytes.length) throw new BadRequest("Photo is not a valid JPEG.");
    if (marker !== APP1 && marker !== APP13) kept.push(bytes.subarray(i, segmentEnd));
    i = segmentEnd;
  }

  throw new BadRequest("Photo is not a valid JPEG.");
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
