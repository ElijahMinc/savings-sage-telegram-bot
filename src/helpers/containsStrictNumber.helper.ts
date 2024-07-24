import { regexStrictNumber } from "@/constants";

export const containsStrictNumber = (text: string) =>
  regexStrictNumber.test(text);
