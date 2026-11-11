import { assert, assertEquals } from "jsr:@std/assert@1";
import { createMailer } from "./email.ts";

const EMAIL = {
  to: ["parent@example.com"],
  subject: "We got Mia’s letter to Santa",
  html: "<p>Hi</p>",
  text: "Hi",
  idempotencyKey: "santa-letters-1-confirmation",
};

Deno.test("no API key, no mailer: email is off, not broken", () => {
  assertEquals(createMailer({ key: null, from: "x@example.com", replyTo: "y@example.com" }), null);
});

Deno.test("sends through Resend with the reply-to, and a message's own reply-to wins", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = createMailer({
    key: "re_test",
    from: "Wausau Pilot & Review <santa@wausaupilotandreview.com>",
    replyTo: "editor@wausaupilotandreview.com",
    fetcher: (url, init) => {
      calls.push({ url, init: init! });
      return Promise.resolve(Response.json({ id: "email_1" }));
    },
  })!;

  assertEquals(await send(EMAIL), { ok: true, id: "email_1" });
  await send({ ...EMAIL, replyTo: "parent@example.com" });

  assertEquals(calls[0].url, "https://api.resend.com/emails");
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("authorization"), "Bearer re_test");
  assertEquals(headers.get("idempotency-key"), "santa-letters-1-confirmation");
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.from, "Wausau Pilot & Review <santa@wausaupilotandreview.com>");
  assertEquals(body.to, ["parent@example.com"]);
  assertEquals(body.reply_to, "editor@wausaupilotandreview.com");
  assertEquals(JSON.parse(String(calls[1].init.body)).reply_to, "parent@example.com");
});

Deno.test("a refusal or a dropped connection comes back as a result, not a throw", async () => {
  const refused = createMailer({
    key: "re_test",
    from: "a@example.com",
    replyTo: "b@example.com",
    fetcher: () => Promise.resolve(new Response("domain not verified", { status: 403 })),
  })!;
  assertEquals(await refused(EMAIL), { ok: false, error: "403 domain not verified" });

  const offline = createMailer({
    key: "re_test",
    from: "a@example.com",
    replyTo: "b@example.com",
    fetcher: () => Promise.reject(new TypeError("connection reset")),
  })!;
  const result = await offline(EMAIL);
  assert(!result.ok && result.error.includes("connection reset"));
});
