// Outbound email through Resend, as the pet contest sends it. Off until RESEND_API_KEY is set:
// createMailer() returns null and callers send nothing, so entries never depend on email.
// Turning it on needs a verified sending domain in Resend (DNS records on
// wausaupilotandreview.com) and the secrets in README, "First deploy".

export interface Email {
  to: string[];
  subject: string;
  html: string;
  text: string;
  // Replies go here instead of the mailer's default reply-to.
  replyTo?: string;
  // Resend drops a repeat of the same key within 24 hours, so a retried send can't double up.
  idempotencyKey: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export type Mailer = (email: Email) => Promise<SendResult>;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createMailer(options: {
  key: string | null;
  from: string;
  replyTo: string;
  // Resend's API unless a local stand-in is given (README, local development).
  url?: string;
  fetcher?: Fetch;
  timeoutMs?: number;
}): Mailer | null {
  const { key, from, replyTo, url = "https://api.resend.com/emails", timeoutMs = 10_000 } = options;
  const fetcher = options.fetcher ?? ((input: string, init?: RequestInit) => fetch(input, init));
  if (!key) return null;

  return async (email) => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: email.to,
          reply_to: email.replyTo ?? replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, error: String(error) };
    }
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${await response.text().catch(() => "")}`.slice(0, 500) };
    }
    const body = await response.json().catch(() => ({})) as { id?: unknown };
    return { ok: true, id: String(body.id ?? "") };
  };
}
