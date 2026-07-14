import { format } from "date-fns";

export function formatDate(dateStr: Date) {
  return format(dateStr, "dd/MM/yyyy");
}
