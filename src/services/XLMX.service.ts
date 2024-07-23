import { IAmountData } from "@/context/context.interface";
import { decrypt } from "@/helpers/decrypt";
import { IEncryptedData } from "@/helpers/encrypt";
import { filterDataForLastMonth } from "@/helpers/filterDataForLastMonth.helper";
import { formatDate } from "@/helpers/formatDate.helper";
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
      filterDataForLastMonth<T>(data);

    let total = 0;
    const transformedData = filteredData.map((item) => {
      const amount = Number(decrypt(item.amount as IEncryptedData));
      total += amount;
      return {
        ...item,
        amount,
        created_date: formatDate(item.created_date),
      };
    });
    transformedData.push({ id: "Total", amount: total } as any);

    const ws = XLSX.utils.json_to_sheet(transformedData);
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

    const allToday = filteredData.every((item) =>
      moment(item.created_date).isSame(moment(), "day")
    );

    const filename = allToday
      ? `transactions_${getTransactionDateFormat()}.xlsx`
      : `transactions_${getTransactionDateFormat(
          startDate
        )}_to_${getTransactionDateFormat(endDate)}.xlsx`;

    return { readStream, filename };
  }
}

export const xlmxService = new XLMXService();
