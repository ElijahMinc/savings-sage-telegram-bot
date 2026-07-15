const AMOUNT_INPUT_REGEXP =
  /^(\d{1,3}(?:[ \u00A0]\d{3})*|\d+)([.,]\d{1,2})?$/;

const WHITESPACE_REGEXP = /[ \u00A0]/g;

export type MoneyInput = number | string;

export function toCents(input: MoneyInput): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      return null;
    }

    return Math.round(input * 100);
  }

  const trimmed = input.trim();
  const match = trimmed.match(AMOUNT_INPUT_REGEXP);

  if (!match) {
    return null;
  }

  const integerPart = match[1].replace(WHITESPACE_REGEXP, "");
  const decimalPart = match[2] ? `.${match[2].slice(1)}` : "";
  const value = Number(`${integerPart}${decimalPart}`);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");

  return `${sign}${whole}.${frac}`;
}
