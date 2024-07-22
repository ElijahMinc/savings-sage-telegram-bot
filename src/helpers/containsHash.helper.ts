import { regexSlash } from "@/constants";

export const containsSlash = (text: string) => regexSlash.test(text);
