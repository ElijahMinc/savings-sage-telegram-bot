import { decrypt } from "@/helpers/decrypt";
import { encrypt, IEncryptedData } from "@/helpers/encrypt";
import { getFixedAmount } from "@/helpers/getFixedAmount";

export type SessionEncryptedNumber = IEncryptedData | number;

export const isEncryptedData = (value: unknown): value is IEncryptedData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as IEncryptedData;
  return typeof candidate.iv === "string" && typeof candidate.content === "string";
};

export const getDecryptedNumber = (
  value?: SessionEncryptedNumber,
): number | undefined => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (!isEncryptedData(value)) {
    return undefined;
  }

  try {
    const decrypted = Number(decrypt(value));
    return Number.isFinite(decrypted) ? decrypted : undefined;
  } catch {
    return undefined;
  }
};

export const encryptNumber = (value: number): IEncryptedData =>
  encrypt(getFixedAmount(value));
