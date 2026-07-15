/* eslint-disable @typescript-eslint/no-explicit-any */
import { IAmountData } from "@/types/app-context.interface";
import { filterDataForDateRange } from "@/helpers/filterDataForDateRange";
import { formatDate } from "@/helpers/formatDate.helper";
import { formatAmount } from "@/helpers/money.helper";
import { getTransactionDateFormat } from "@/helpers/getTransactionDateFormat";
import { format, isSameDay, isSameMonth } from "date-fns";
import { Stream } from "stream";
import XLSX from "xlsx";

class XLMXService {
  private getDataForCurrentPeriod<T extends IAmountData>(
    data: T[],
    period: "day" | "month",
  ) {
    const now = new Date();
    const compare = period === "day" ? isSameDay : isSameMonth;
    return data.filter((item) => compare(new Date(item.created_date), now));
  }

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
    type: "expenses" | "income",
  ) {
    const { filteredData, startDate, endDate } =
      filterDataForDateRange<T>(data);

    let total = 0;
    const transformedData = filteredData.map((item) => {
      total += item.amount;

      return {
        id: item.id,
        amount: formatAmount(item.amount),
        category: item.category,
        created_date: formatDate(item.created_date),
        currency: item.currency,
      };
    });
    transformedData.push({ id: "Total", amount: formatAmount(total) } as any);

    const ws = XLSX.utils.json_to_sheet(transformedData);

    for (let i = 1; i <= filteredData.length + 1; i++) {
      ws[`B${i}`].s = { alignment: { horizontal: "left" } }; // РљРѕР»РѕРЅРєР° B - amount
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      type === "expenses" ? "Expenses" : "Income",
    );

    const wscols = [
      { wch: 20 }, // id
      { wch: 10 }, // amount
      { wch: 15 }, // category
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
      isSameDay(new Date(item.created_date), new Date(arr[0].created_date)),
    );

    const firstTransaction = filteredData[0].created_date; // because each of them has the same day

    const filename = allSameDay
      ? `transactions_${getTransactionDateFormat(
          new Date(firstTransaction),
        )}.xlsx`
      : `transactions_${getTransactionDateFormat(
          startDate,
        )}_to_${getTransactionDateFormat(endDate)}.xlsx`;

    return { readStream, filename };
  }

  private getAnalyticsReadStream<T extends IAmountData>(
    expensesInput: T[],
    incomeInput: T[],
    monthlySavingsGoal?: number,
    period: "day" | "month" = "month",
  ) {
    const expenses = this.getDataForCurrentPeriod(expensesInput, period);
    const income = this.getDataForCurrentPeriod(incomeInput, period);
    const now = new Date();
    const periodLabel =
      period === "day" ? format(now, "yyyy-MM-dd") : format(now, "yyyy-MM");

    const transactionRows = [
      ...income.map((item) => ({
        createdDate: new Date(item.created_date).getTime(),
        row: [
          formatDate(item.created_date),
          "Income",
          item.category || "Other",
          `+${formatAmount(item.amount)}`,
          item.currency,
        ],
      })),
      ...expenses.map((item) => ({
        createdDate: new Date(item.created_date).getTime(),
        row: [
          formatDate(item.created_date),
          "Expense",
          item.category || "Other",
          `-${formatAmount(item.amount)}`,
          item.currency,
        ],
      })),
    ].sort((a, b) => a.createdDate - b.createdDate);

    const totalExpenses = expenses.reduce(
      (acc, item) => acc + item.amount,
      0,
    );
    const totalIncome = income.reduce(
      (acc, item) => acc + item.amount,
      0,
    );
    const net = totalIncome - totalExpenses;
    const expenseIncomePercent =
      totalIncome > 0
        ? `${((totalExpenses / totalIncome) * 100).toFixed(1)}%`
        : "n/a";

    const groupedExpenseCategories = expenses.reduce<Map<string, number>>(
      (acc, item) => {
        const key = item.category?.trim() || "Other";
        acc.set(key, (acc.get(key) ?? 0) + item.amount);
        return acc;
      },
      new Map<string, number>(),
    );
    const topCategories = Array.from(groupedExpenseCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const savingsGoalValue =
      monthlySavingsGoal != null
        ? `${formatAmount(monthlySavingsGoal)} EUR`
        : "not set";
    const currentSurplusValue = `${formatAmount(net)} EUR`;
    const goalStatusValue =
      monthlySavingsGoal == null
        ? "not set"
        : net >= monthlySavingsGoal
          ? "ACHIEVED ✅"
          : `REMAINING ${formatAmount(monthlySavingsGoal - net)} EUR`;

    const rows: (string | number)[][] = [
      ["Date", "Type", "Category", "Amount", "Currency"],
      ...transactionRows.map((item) => item.row),
      [],
      ["--- SUMMARY ---"],
      ["TOTAL INCOME:", `${formatAmount(totalIncome)} EUR`],
      ["TOTAL EXPENSES:", `${formatAmount(totalExpenses)} EUR`],
      ["--------------------------------"],
      ["NET RESULT:", `${formatAmount(net)} EUR`],
      [],
      ["Expenses / Income:", expenseIncomePercent],
      [],
      ["--- CATEGORY BREAKDOWN ---"],
      ["Top categories:"],
    ];

    if (topCategories.length) {
      topCategories.forEach(([category, amount], index) => {
        const percent =
          totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
        rows.push([
          `${index + 1}. ${category} - ${formatAmount(amount)} EUR (${percent}%)`,
        ]);
      });
    } else {
      rows.push([`No expense categories for current ${period}.`]);
    }

    rows.push(
      [],
      ["--- SAVINGS ---"],
      ["Savings goal:", savingsGoalValue],
      ["Current surplus:", currentSurplusValue],
      ["Goal status:", goalStatusValue],
    );

    const reportSheet = XLSX.utils.aoa_to_sheet(rows);
    reportSheet["!cols"] = [
      { wch: 40 },
      { wch: 24 },
      { wch: 24 },
      { wch: 16 },
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, reportSheet, "Report");

    const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const readStream = new Stream.PassThrough();
    readStream.end(xlsxBuffer);

    return {
      readStream,
      filename: `${
        period === "day" ? "daily_analytics" : "monthly_analytics"
      }_${periodLabel}.xlsx`,
    };
  }

  getMonthlyAnalyticsReadStream<T extends IAmountData>(
    expensesInput: T[],
    incomeInput: T[],
    monthlySavingsGoal?: number,
  ) {
    return this.getAnalyticsReadStream(
      expensesInput,
      incomeInput,
      monthlySavingsGoal,
      "month",
    );
  }

  getDailyAnalyticsReadStream<T extends IAmountData>(
    expensesInput: T[],
    incomeInput: T[],
    monthlySavingsGoal?: number,
  ) {
    return this.getAnalyticsReadStream(
      expensesInput,
      incomeInput,
      monthlySavingsGoal,
      "day",
    );
  }
}

export const xlmxService = new XLMXService();
