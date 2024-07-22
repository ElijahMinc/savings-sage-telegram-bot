import { transactionDefaultFormatDate } from "@/constants";
import moment from "moment";

export const getTransactionDateFormat = (momentDate?: moment.Moment) =>
  !momentDate
    ? moment().format(transactionDefaultFormatDate)
    : moment(momentDate).format(transactionDefaultFormatDate);
