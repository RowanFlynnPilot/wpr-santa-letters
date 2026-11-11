import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { BadRequest } from "./errors.ts";
import { stripLocationMetadata } from "./jpeg.ts";

// 16x16 JPEG with an Exif block holding GPS coordinates near Wausau, made with Pillow.
const PHOTO_WITH_GPS = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4QCsRXhpZgAATU0AKgAAAAgAAwEPAAIAAAALAAAAMgESAAMAAAABAAEAAIglAAQAAAABAAAAPgAAAABQaG9uZU1ha2VyAAAABAABAAIAAAACTgAAAAACAAUAAAADAAAAdAADAAIAAAACVwAAAAAEAAUAAAADAAAAjAAAAAAAAAAsAAAAAQAAADkAAAABAAAAJAAAAAEAAABZAAAAAQAAACUAAAABAAAAMAAAAAH/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKKKK8g9M/9k=",
  ),
  (c) => c.charCodeAt(0),
);

function contains(haystack: Uint8Array, needle: string): boolean {
  return new TextDecoder("latin1").decode(haystack).includes(needle);
}

Deno.test("removes the Exif block, GPS included", () => {
  assert(contains(PHOTO_WITH_GPS, "Exif"), "fixture should start with Exif");
  const stripped = stripLocationMetadata(PHOTO_WITH_GPS);
  assert(!contains(stripped, "Exif"));
  assertEquals([stripped[0], stripped[1]], [0xff, 0xd8]);
  assert(stripped.length < PHOTO_WITH_GPS.length);
});

Deno.test("keeps image data byte-for-byte from the start of scan", () => {
  const sos = (b: Uint8Array) => b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xda);
  const stripped = stripLocationMetadata(PHOTO_WITH_GPS);
  assertEquals(stripped.subarray(sos(stripped)), PHOTO_WITH_GPS.subarray(sos(PHOTO_WITH_GPS)));
});

Deno.test("leaves a photo with no location metadata unchanged", () => {
  const clean = stripLocationMetadata(PHOTO_WITH_GPS);
  assertEquals(stripLocationMetadata(clean), clean);
});

Deno.test("rejects files that are not JPEGs", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertThrows(() => stripLocationMetadata(png), BadRequest, "Photo must be a JPEG.");
});

Deno.test("rejects a truncated JPEG", () => {
  assertThrows(() => stripLocationMetadata(PHOTO_WITH_GPS.subarray(0, 40)), BadRequest, "not a valid JPEG");
});
