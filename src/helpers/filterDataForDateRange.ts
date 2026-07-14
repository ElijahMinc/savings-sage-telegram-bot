import { endOfDay, startOfDay } from "date-fns";
import { IAmountData } from "@/types/app-context.interface";

export function filterDataForDateRange<T extends IAmountData>(data: T[]) {
  if (data.length === 0) {
    return {
      filteredData: [],
      startDate: null,
      endDate: null,
    };
  }

  const sortedData = data.sort(
    (a, b) =>
      new Date(a.created_date).valueOf() - new Date(b.created_date).valueOf(),
  );
  const startDate = startOfDay(new Date(sortedData[0].created_date));
  const endDate = endOfDay(
    new Date(sortedData[sortedData.length - 1].created_date),
  );

  return {
    filteredData: sortedData,
    startDate,
    endDate,
  };
}
