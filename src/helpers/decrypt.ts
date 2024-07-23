import crypto from "crypto";
import { IEncryptedData } from "./encrypt";

export const decrypt = (hash: IEncryptedData): string => {
  const decipher = crypto.createDecipheriv(
    process.env.ALGORITHM!,
    process.env.SECRET_KEY!,
    Buffer.from(hash.iv, "hex")
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString();
};
