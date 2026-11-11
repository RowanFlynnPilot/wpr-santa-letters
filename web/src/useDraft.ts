// A staff tool unmounts when another tab is picked. Work typed into one (a mailed letter half typed in,
// the article's intro) is kept here for the life of the page, so switching tabs to look something up
// never loses it. Reloading the page does.
import { useState } from "react";

const drafts = new Map<string, unknown>();

export function useDraft<T>(key: string, initial: T): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (drafts.has(key) ? (drafts.get(key) as T) : initial));
  const set = (next: T | ((current: T) => T)) =>
    setValue((current) => {
      const value = typeof next === "function" ? (next as (current: T) => T)(current) : next;
      drafts.set(key, value);
      return value;
    });
  return [value, set];
}
