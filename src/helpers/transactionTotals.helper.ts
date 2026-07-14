import { isSameDay, isSameMonth } from "date-fns";
import { IAmountData } from "@/types/app-context.interface";
import { decrypt } from "@/helpers/decrypt";
import { IEncryptedData } from "@/helpers/encrypt";

export function decryptTransactionAmount(amount: IAmountData["amount"]): number {
  if (typeof amount === "number") {
    return amount;
  }

  return Number(decrypt(amount as IEncryptedData));
}

export function sumTransactionsForDay(
  transactions: IAmountData[],
  date: Date = new Date(),
): number {
  return transactions
    .filter((t) => isSameDay(new Date(t.created_date), date))
    .reduce((total, t) => total + decryptTransactionAmount(t.amount), 0);
}

export function sumTransactionsForMonth(
  transactions: IAmountData[],
  date: Date = new Date(),
): number {
  return transactions
    .filter((t) => isSameMonth(new Date(t.created_date), date))
    .reduce((total, t) => total + decryptTransactionAmount(t.amount), 0);
}

export function sumTransactionsForLastHour(transactions: IAmountData[]): number {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  return transactions
    .filter((t) => new Date(t.created_date) > oneHourAgo)
    .reduce((total, t) => total + decryptTransactionAmount(t.amount), 0);
}
