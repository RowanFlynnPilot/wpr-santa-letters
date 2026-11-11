// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assertEquals } from "jsr:@std/assert@1";
import { type Calendar, countdown, daysUntil } from "./countdown.ts";

// The 2026 calendar (supabase/seasons/2026.sql): opens Nov. 27, closes at the end of Dec. 18, delivered
// Dec. 23 at 6 a.m., all in Wausau's time.
const season = (phase: Calendar["phase"]): Calendar => ({
  phase,
  entries_open_at: "2026-11-27T06:00:00Z",
  entries_close_at: "2026-12-19T06:00:00Z",
  delivered_at: "2026-12-23T12:00:00Z",
});
const at = (wausau: string) => Date.parse(`${wausau}-06:00`);

Deno.test("days are counted on Wausau's calendar, not in 24-hour blocks", () => {
  // 11:30 p.m. on Dec. 17 in Wausau is already Dec. 18 in UTC: the 18th is still tomorrow.
  assertEquals(daysUntil("2026-12-19T05:59:59Z", at("2026-12-17T23:30:00")), 1);
  assertEquals(daysUntil("2026-12-19T05:59:59Z", at("2026-12-18T00:30:00")), 0);
  // Across the end of daylight time (Nov. 1, 2026), when a day is 25 hours long.
  assertEquals(daysUntil("2026-11-27T06:00:00Z", Date.parse("2026-10-28T12:00:00-05:00")), 30);
});

Deno.test("before letters open, it counts down to opening day", () => {
  assertEquals(countdown(season("upcoming"), at("2026-11-10T09:00:00")), "Santa’s mailbag opens in 17 days.");
  assertEquals(countdown(season("upcoming"), at("2026-11-20T09:00:00")), "Santa’s mailbag opens in seven days.");
  assertEquals(countdown(season("upcoming"), at("2026-11-26T22:00:00")), "Santa’s mailbag opens tomorrow.");
});

Deno.test("while letters are open, it counts down to the last day to write, Dec. 18", () => {
  assertEquals(countdown(season("open"), at("2026-11-27T08:00:00")), "21 days left to send a letter.");
  assertEquals(countdown(season("open"), at("2026-12-13T08:00:00")), "Five days left to send a letter.");
  assertEquals(countdown(season("open"), at("2026-12-17T23:30:00")), "Tomorrow is the last day to send a letter.");
  assertEquals(countdown(season("open"), at("2026-12-18T23:30:00")), "Today is the last day to send a letter.");
});

Deno.test("once letters close, it counts down to delivery; after that it says nothing", () => {
  assertEquals(countdown(season("closed"), at("2026-12-19T09:00:00")), "The letters go to the North Pole in four days.");
  assertEquals(countdown(season("closed"), at("2026-12-22T09:00:00")), "The letters go to the North Pole tomorrow.");
  assertEquals(countdown(season("closed"), at("2026-12-23T05:00:00")), "The letters go to the North Pole today.");
  assertEquals(countdown(season("delivered"), at("2026-12-23T07:00:00")), null);
});

Deno.test("a device whose clock disagrees with the phase gets no countdown rather than a wrong one", () => {
  assertEquals(countdown(season("upcoming"), at("2026-11-28T09:00:00")), null);
  assertEquals(countdown(season("open"), at("2026-12-20T09:00:00")), null);
  assertEquals(countdown(season("closed"), at("2026-12-24T09:00:00")), null);
});
