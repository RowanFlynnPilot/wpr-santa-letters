// The envelope's countdown: how many days until the next date on the season's calendar. It reads the phase
// the database gave (invariant 1: phase_at is the only phase logic) and only counts Wausau calendar days to
// the date that phase is waiting for. No imports, so Deno can test it as it is (countdown_test.ts).

const CHICAGO = "America/Chicago";
const DAY = 86_400_000;

// A moment's calendar day in Wausau, as a whole number of days, so two can be subtracted. Counting days by
// the calendar, not by 24 hours, keeps "tomorrow" right late at night and across the end of daylight time.
function wausauDay(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.round(Date.UTC(part("year"), part("month") - 1, part("day")) / DAY);
}

export function daysUntil(timestamp: string, now: number = Date.now()): number {
  return wausauDay(Date.parse(timestamp)) - wausauDay(now);
}

// AP numbers: one through nine in words, 10 and up in figures.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const ap = (n: number) => (n < 10 ? WORDS[n] : String(n));
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface Calendar {
  phase: "upcoming" | "open" | "closed" | "delivered";
  entries_open_at: string;
  // Exclusive: letters close at midnight, so the last day to write is the day before.
  entries_close_at: string;
  delivered_at: string;
}

// One short sentence for the envelope, or nothing once the letters are delivered (or if the clock on this
// device disagrees with the phase, which the database decides).
export function countdown(season: Calendar, now: number = Date.now()): string | null {
  if (season.phase === "upcoming") {
    const days = daysUntil(season.entries_open_at, now);
    if (days < 1) return null;
    return days === 1 ? "Santa’s mailbag opens tomorrow." : `Santa’s mailbag opens in ${ap(days)} days.`;
  }
  if (season.phase === "open") {
    const lastDay = new Date(Date.parse(season.entries_close_at) - 1).toISOString();
    const days = daysUntil(lastDay, now);
    if (days < 0) return null;
    if (days === 0) return "Today is the last day to send a letter.";
    if (days === 1) return "Tomorrow is the last day to send a letter.";
    return `${capitalized(ap(days))} days left to send a letter.`;
  }
  if (season.phase === "closed") {
    const days = daysUntil(season.delivered_at, now);
    if (days < 0) return null;
    if (days === 0) return "The letters go to the North Pole today.";
    if (days === 1) return "The letters go to the North Pole tomorrow.";
    return `The letters go to the North Pole in ${ap(days)} days.`;
  }
  return null;
}

// Where things sit on the route drawn above the envelope, from Wausau (0, the day letters open) to the
// North Pole (1, delivery): the last day to write, and the sleigh. The phase decides which stretch the
// sleigh is on (invariant 1); the clock only places it within that stretch, so a device with the wrong
// date can't put the sleigh at the North Pole while letters are still open.
export function route(season: Calendar, now: number = Date.now()): { sleigh: number; lastDay: number } {
  const start = Date.parse(season.entries_open_at);
  const span = Date.parse(season.delivered_at) - start;
  const along = (ms: number) => (span > 0 ? Math.min(1, Math.max(0, (ms - start) / span)) : 0);
  const lastDay = along(Date.parse(season.entries_close_at));
  const within = (low: number, high: number) => Math.min(high, Math.max(low, along(now)));
  if (season.phase === "upcoming") return { sleigh: 0, lastDay };
  if (season.phase === "open") return { sleigh: within(0, lastDay), lastDay };
  if (season.phase === "closed") return { sleigh: within(lastDay, 0.98), lastDay };
  return { sleigh: 1, lastDay };
}
