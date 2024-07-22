import { regexAllSymbols } from "@/constants";

export const containsSpecialChars = (text: string) =>
  regexAllSymbols.test(text);
