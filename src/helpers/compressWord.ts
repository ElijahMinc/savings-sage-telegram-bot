export const compressWord = (str: string): string =>
  str.toLowerCase().replace(/\s+/g, "").trim();
