import { IEncryptedData } from "@/helpers/encrypt";
import { Context, Scenes } from "telegraf";
import {
  BaseScene,
  Stage,
  SceneContextScene,
  SceneContext,
} from "telegraf/typings/scenes";

export enum CURRENCIES {
  DOLLAR = "USD",
  EURO = "EUR",
  GRIVNA = "UAH",
}

interface TagScene extends Scenes.SceneSessionData {}

interface ExpenseTransactionScene extends Scenes.SceneSessionData {
  choosenTag?: string;
}

export interface IAmountData {
  id: number;
  tag: string;
  amount: IEncryptedData | number;
  currency: string;
  created_date: Date;
}

export interface SessionData {
  chatId: number;
  mode: "income" | "expense";
  expenses: IAmountData[];
  income: IAmountData[];
  tags: string[];
  isDailyFileReport: boolean;
}

// Определяем интерфейс контекста бота
export interface IBotContext extends Context {
  session: SessionData;
}

export type SceneContexts<Type> = Type extends "TagScene"
  ? IBotContext & SceneContext<TagScene>
  : Type extends "ExpenseTransactionScene"
  ? IBotContext & SceneContext<ExpenseTransactionScene>
  : never;
