import {
  endOfDay,
  isWithinInterval,
  startOfDay,
  subMonths,
} from "date-fns";
import { IAmountData } from "@/types/app-context.interface";

export function filterDataForLastMonth<T extends IAmountData>(data: T[]) {
  const lastTransactionDate = new Date(data[data.length - 1].created_date);
  const startDate = startOfDay(subMonths(lastTransactionDate, 1));
  const endDate = endOfDay(lastTransactionDate);

  return {
    filteredData: data.filter((item) =>
      isWithinInterval(new Date(item.created_date), {
        start: startDate,
        end: endDate,
      }),
    ),
    startDate,
    endDate,
  };
}
