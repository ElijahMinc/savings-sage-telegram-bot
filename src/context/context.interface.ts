import { Context } from "telegraf";

export enum CURRENCIES {
  DOLLAR = "USD",
  EURO = "EUR",
  GRIVNA = "UAH",
}

export interface IAmountData {
  id: number;
  tag: string;
  amount: number;
  currency: CURRENCIES;
  created_date: Date;
}

export interface SessionData {
  chatId: number;
  mode: "income" | "expense";
  expenses: IAmountData[];
  income: IAmountData[];
  tags: string[];
  timezone: string;

  isMonthlyFileReport: boolean;
}

export interface IBotContext extends Context {
  session: SessionData;
}