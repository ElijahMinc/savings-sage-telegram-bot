import { IAmountData } from "@/context/context.interface";
import moment from "moment";

export function getDateRange(data: IAmountData[]) {
  const lastTransactionDate = moment(data[data.length - 1].created_date);
  const startDate = lastTransactionDate.clone().subtract(1, "month");
  return {
    startDate: startDate.format("DD-MM-YYYY"),
    endDate: lastTransactionDate.format("DD-MM-YYYY"),
  };
}
