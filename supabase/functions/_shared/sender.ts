// Where a form letter came from, as a key the daily limit can count by without anyone keeping the address
// itself (migration 0010, allow_sender). The network address is scrambled with a project secret (HMAC),
// so the key can't be turned back into an address or matched against one by anyone without the secret.

// The sender's network address from the request. Supabase's API sits behind Cloudflare, which sets
// CF-Connecting-IP itself, whatever the sender sent: that is the one to trust. X-Forwarded-For is only the
// fallback, because a sender can put anything they like at the front of it (reported on Supabase's own
// forum), which would let a flood pose as a new sender every time. Null when there's neither (a local
// call), and then no limit applies.
export function senderAddress(headers: Headers): string | null {
  const address = headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() || "";
  return address ? address.toLowerCase() : null;
}

// What the limit counts by. A home or a phone gets a whole block of IPv6 addresses (a /64) and can change
// the rest at will, so an IPv6 address counts as its first four groups; an IPv4 address counts as itself.
export function addressGroup(address: string): string {
  if (!address.includes(":")) return address;
  // An IPv4 address written as IPv6 (::ffff:203.0.113.7) is that IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];
  const [head, tail = ""] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...front, ...new Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back]
    : front;
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export async function senderKey(address: string, secret: string): Promise<string> {
  const encode = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encode.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encode.encode(`santa-letters-sender:${addressGroup(address)}`));
  // 32 hex characters (128 bits) is plenty to tell senders apart.
  return [...new Uint8Array(mac)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
