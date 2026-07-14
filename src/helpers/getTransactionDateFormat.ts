import { format } from "date-fns";
import { transactionDefaultFormatDate } from "@/constants";

export const getTransactionDateFormat = (date?: Date | null) =>
  format(date ?? new Date(), transactionDefaultFormatDate);
