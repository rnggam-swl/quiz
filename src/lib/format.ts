const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 jam yang lalu", "kemarin", "baru saja". */
export function timeAgo(date: Date | string, now = new Date()): string {
  const seconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "baru saja";
}

/** Escape LIKE/ILIKE wildcards so user search text matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
