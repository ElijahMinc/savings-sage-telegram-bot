import { IAmountData } from "@/context/context.interface";
import { filterDataForLastMonth } from "@/helpers/filterDataForLastMonth.helper";
import { formatDate } from "@/helpers/formatDate.helper";
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

  generateXlsxStream<T extends IAmountData>(data: T[]) {
    const { filteredData, startDate, endDate } =
      filterDataForLastMonth<T>(data);

    let total = 0;
    const transformedData = filteredData.map((item) => {
      total += item.amount;
      return {
        ...item,
        created_date: formatDate(item.created_date),
      };
    });
    transformedData.push({ id: "Total", amount: total } as any);

    const ws = XLSX.utils.json_to_sheet(transformedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

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
}

export const xlmxService = new XLMXService();
