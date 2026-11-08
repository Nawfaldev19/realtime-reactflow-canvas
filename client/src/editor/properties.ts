import { jsonEqual } from "../document/operations";

// Pure helpers for the properties panel.

/** The value every item agrees on, or null when they differ (or there are none). */
export function sharedValue<T, V>(items: readonly T[], read: (item: T) => V): V | null {
  const [first, ...rest] = items;
  if (first === undefined) return null;
  const value = read(first);
  return rest.every((item) => jsonEqual(read(item), value)) ? value : null;
}

/** Parses a number field. Empty or invalid input is null; "0" is a valid zero. */
export function parseNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** How a number is shown in a field: rounded to two decimals, blank when mixed. */
export function formatNumber(value: number | null): string {
  return value === null ? "" : String(Math.round(value * 100) / 100);
}
