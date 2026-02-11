import { IEncryptedData } from "@/helpers/encrypt";
import { Context, Scenes } from "telegraf";
import { SceneContext } from "telegraf/typings/scenes";

export enum CURRENCIES {
  DOLLAR = "USD",
  EURO = "EUR",
  GRIVNA = "UAH",
}

interface ExpenseTransactionScene extends Scenes.SceneSessionData {
  pendingAmount?: number;
  pendingAmountLabel?: string;
  pendingCategories?: string[];
  awaitingCustomCategory?: boolean;
}

interface IncomeTransactionScene extends Scenes.SceneSessionData {
  chosenCategory?: string;
}

interface TransactionsScene extends Scenes.SceneSessionData {
  currentPage?: number;
  panelMessageId?: number;
  targetTransactionId?: number;
  targetTransactionType?: TransactionType;
  editMode?: "amount" | "category";
}

export interface IAmountData {
  id: number;
  category: string;
  // Legacy DB field. Old records may still contain `tag`.
  tag?: string;
  amount: IEncryptedData | number;
  currency: string;
  created_date: Date;
}

export type TransactionType = "expense" | "income";

export interface ITransactionRecord extends IAmountData {
  key: string;
  type: TransactionType;
}

export interface SessionData {
  monthlySavingsGoal?: IEncryptedData | number;
  savingsGoalExtraAmount?: IEncryptedData | number;
  savingsGoalCarryoverDate?: string;
  savingsGoalCarryoverAmount?: IEncryptedData | number;
}

export interface IBotContext extends Context {
  session: SessionData;
}

export type SceneContexts<Type> = Type extends "ExpenseTransactionScene"
  ? IBotContext & SceneContext<ExpenseTransactionScene>
  : Type extends "IncomeTransactionScene"
    ? IBotContext & SceneContext<IncomeTransactionScene>
    : Type extends "TransactionsScene"
      ? IBotContext & SceneContext<TransactionsScene>
    : never;
