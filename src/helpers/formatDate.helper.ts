import moment from "moment";

export function formatDate(dateStr: Date) {
  return moment(dateStr).format("DD/MM/YYYY");
}
