const FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return FORMAT.format(new Date(iso));
}
