import { IAmountData } from "@/context/context.interface";
import moment from "moment";

export function filterDataForLastMonth<T extends IAmountData>(data: T[]) {
  const lastTransactionDate = moment(data[data.length - 1].created_date);
  const startDate = lastTransactionDate
    .clone()
    .subtract(1, "month")
    .startOf("day");
  const endDate = lastTransactionDate.clone().endOf("day");

  return {
    filteredData: data.filter((item) =>
      moment(item.created_date).isBetween(startDate, endDate, null, "[]")
    ),
    startDate: startDate,
    endDate: endDate,
  };
}
