import { iv } from "@/constants";
import crypto from "crypto";

export interface IEncryptedData {
  iv: string;
  content: string;
}

export const encrypt = (data: any): IEncryptedData => {
  const cipher = crypto.createCipheriv(
    process.env.ALGORITHM!,
    process.env.SECRET_KEY!,
    iv
  );
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    content: encrypted.toString("hex"),
  };
};
