import { format, subMonths } from "date-fns";
import { IAmountData } from "@/types/app-context.interface";

export function getDateRange(data: IAmountData[]) {
  const lastTransactionDate = new Date(data[data.length - 1].created_date);
  const startDate = subMonths(lastTransactionDate, 1);
  return {
    startDate: format(startDate, "dd-MM-yyyy"),
    endDate: format(lastTransactionDate, "dd-MM-yyyy"),
  };
}
