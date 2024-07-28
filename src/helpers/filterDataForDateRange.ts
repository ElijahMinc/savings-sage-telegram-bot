import { IAmountData } from "@/context/context.interface";
import moment from "moment";

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
      new Date(a.created_date).valueOf() - new Date(b.created_date).valueOf()
  );
  const startDate = moment(sortedData[0].created_date).startOf("day");
  const endDate = moment(sortedData[sortedData.length - 1].created_date).endOf(
    "day"
  );

  return {
    filteredData: sortedData,
    startDate: startDate,
    endDate: endDate,
  };
}
