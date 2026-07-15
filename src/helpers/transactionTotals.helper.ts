import { isSameDay, isSameMonth } from "date-fns";
import { IAmountData } from "@/types/app-context.interface";

export function sumTransactionsForDay(
  transactions: IAmountData[],
  date: Date = new Date(),
): number {
  return transactions
    .filter((t) => isSameDay(new Date(t.created_date), date))
    .reduce((total, t) => total + t.amount, 0);
}

export function sumTransactionsForMonth(
  transactions: IAmountData[],
  date: Date = new Date(),
): number {
  return transactions
    .filter((t) => isSameMonth(new Date(t.created_date), date))
    .reduce((total, t) => total + t.amount, 0);
}

