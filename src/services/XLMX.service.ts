import { IAmountData } from "@/context/context.interface";
import { decrypt } from "@/helpers/decrypt";
import { IEncryptedData } from "@/helpers/encrypt";
import { filterDataForDateRange } from "@/helpers/filterDataForDateRange";
import { filterDataForLastMonth } from "@/helpers/filterDataForLastMonth.helper";
import { formatDate } from "@/helpers/formatDate.helper";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { getTransactionDateFormat } from "@/helpers/getTransactionDateFormat";
import moment from "moment";
import { Stream } from "stream";
import XLSX from "xlsx";

class XLMXService {
  generateXlsx<T>(data: T[]) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const filePath = "data.xlsx";
    XLSX.writeFile(wb, filePath);
    return filePath;
  }

  generateXlsxStream<T extends IAmountData>(
    data: T[],
    type: "expenses" | "income"
  ) {
    const { filteredData, startDate, endDate } =
      filterDataForDateRange<T>(data);

    let total = 0;
    const transformedData = filteredData.map((item) => {
      const amount = Number(decrypt(item.amount as IEncryptedData));
      total += amount;
      return {
        ...item,
        amount: getFixedAmount(amount),
        created_date: formatDate(item.created_date),
      };
    });
    transformedData.push({ id: "Total", amount: getFixedAmount(total) } as any);

    const ws = XLSX.utils.json_to_sheet(transformedData);

    for (let i = 1; i <= filteredData.length + 1; i++) {
      ws[`B${i}`].s = { alignment: { horizontal: "left" } }; // Колонка B - amount
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type ? "Expenses" : "Incomes");

    const wscols = [
      { wch: 20 }, // id
      { wch: 10 }, // amount
      { wch: 15 }, // tag
      { wch: 15 }, // created_date
      { wch: 10 }, // currency
    ];
    ws["!cols"] = wscols;

    const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const readStream = new Stream.PassThrough();
    readStream.end(xlsxBuffer);

    return { readStream, filteredData, startDate, endDate };
  }

  getReadStreamByData<T extends IAmountData>(data: T[]) {
    const { readStream, startDate, endDate, filteredData } =
      xlmxService.generateXlsxStream(data, "expenses");

    const allSameDay = filteredData.every((item, _, arr) =>
      moment(item.created_date).isSame(moment(arr[0].created_date), "day")
    );

    const firstTransaction = filteredData[0].created_date; // because each of them has the same day

    const filename = allSameDay
      ? `transactions_${getTransactionDateFormat(
          moment(firstTransaction)
        )}.xlsx`
      : `transactions_${getTransactionDateFormat(
          startDate
        )}_to_${getTransactionDateFormat(endDate)}.xlsx`;

    return { readStream, filename };
  }
}

export const xlmxService = new XLMXService();
