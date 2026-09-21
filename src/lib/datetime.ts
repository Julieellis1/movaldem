export const LAGOS_TZ = "Africa/Lagos";
export function toLagosDate(utc: Date): Date {
  return new Date(utc.toLocaleString("en-US", { timeZone: LAGOS_TZ }));
}
export function isoWeekKey(utc: Date): string {
  const d = toLagosDate(utc);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (tmp.getUTCDay() + 6) % 7; // Monday = 0
  tmp.setUTCDate(tmp.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  const week =
    1 +
    Math.round(
      (tmp.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
  const year = tmp.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export function monthKey(utc: Date): string {
  const d = toLagosDate(utc);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function yearKey(utc: Date): string {
  return String(toLagosDate(utc).getFullYear());
}
