import { env } from "./env";

// Public file addresses, built as the Supabase client builds them but without loading it, so the
// mailbag shows photos and logos without the client's download.
const PUBLIC = `${env.supabaseUrl}/storage/v1/object/public`;

function publicUrl(bucket: string, path: string): string {
  return encodeURI(`${PUBLIC}/${bucket}/${path.replace(/^\/+/, "")}`);
}

// Storage layout: letter-photos/<photo_id>/{full,thumb}.jpg
export function photoPaths(photoId: string): [full: string, thumb: string] {
  return [`${photoId}/full.jpg`, `${photoId}/thumb.jpg`];
}

export function photoUrl(photoId: string, size: "full" | "thumb"): string {
  return publicUrl("letter-photos", `${photoId}/${size}.jpg`);
}

export function logoUrl(path: string): string {
  return publicUrl("sponsor-logos", path);
}
