const NIGERIA_LOCALE = "en-NG";
export function formatNaira(kobo: number): string {
  if (!Number.isInteger(kobo)) throw new Error("Amount must be integer kobo");
  const naira = kobo / 100;
  return new Intl.NumberFormat(NIGERIA_LOCALE, {
    style: "currency", currency: "NGN", minimumFractionDigits: 2,
  }).format(naira);
}
export function parseNairaToKobo(input: string): number {
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error("Invalid amount");
  const naira = Number(input);
  if (!Number.isFinite(naira) || naira < 0) throw new Error("Invalid amount");
  return Math.round(naira * 100);
}
