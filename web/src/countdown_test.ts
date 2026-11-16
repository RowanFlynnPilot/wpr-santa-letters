// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assertEquals } from "jsr:@std/assert@1";
import { type Calendar, countdown, daysUntil, route } from "./countdown.ts";

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

Deno.test("the sleigh is as far along the route as the season is, on the stretch its phase allows", () => {
  const near = (actual: number, expected: number) => assertEquals(Math.round(actual * 100), Math.round(expected * 100));
  // The last day to write sits where letters close: 22 of the 26 and a quarter days from opening to delivery.
  near(route(season("open"), at("2026-12-05T12:00:00")).lastDay, 22 / 26.25);
  // Before letters open the sleigh waits in Wausau; once they're delivered it's at the North Pole.
  assertEquals(route(season("upcoming"), at("2026-11-20T12:00:00")).sleigh, 0);
  assertEquals(route(season("delivered"), at("2026-12-23T07:00:00")).sleigh, 1);
  // While letters are open it moves a little each day, and never past the last day to write.
  const dec5 = route(season("open"), at("2026-12-05T12:00:00")).sleigh;
  const dec6 = route(season("open"), at("2026-12-06T12:00:00")).sleigh;
  near(dec5, 8.5 / 26.25);
  assertEquals(dec6 > dec5, true);
  // After they close it's on the last stretch, short of the Pole until delivery.
  const dec21 = route(season("closed"), at("2026-12-21T12:00:00")).sleigh;
  assertEquals(dec21 > route(season("closed"), at("2026-12-19T01:00:00")).sleigh, true);
  assertEquals(dec21 < 1, true);
});

Deno.test("a device with the wrong date can't move the sleigh off its phase's stretch", () => {
  const open = season("open");
  const lastDay = route(open, at("2026-12-05T12:00:00")).lastDay;
  // A clock set to next year, while the database says letters are open: the sleigh stops at the last day.
  assertEquals(route(open, at("2027-06-01T12:00:00")).sleigh, lastDay);
  // A clock set to last year: it's at the start, not off the route.
  assertEquals(route(open, at("2025-06-01T12:00:00")).sleigh, 0);
  // Closed, with a clock still in November: the sleigh is already at the last day, not behind it.
  assertEquals(route(season("closed"), at("2026-11-30T12:00:00")).sleigh, lastDay);
  assertEquals(route(season("closed"), at("2027-06-01T12:00:00")).sleigh, 0.98);
});
