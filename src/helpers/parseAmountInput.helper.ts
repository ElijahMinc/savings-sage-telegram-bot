export function parseAmountInput(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(\d{1,3}(?:[ \u00A0]\d{3})*|\d+)([.,]\d{1,2})?$/,
  );

  if (!match) {
    return null;
  }

  const integerPart = match[1].replace(/[ \u00A0]/g, "");
  const decimalPart = match[2] ? `.${match[2].slice(1)}` : "";
  const amount = Number(`${integerPart}${decimalPart}`);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}
