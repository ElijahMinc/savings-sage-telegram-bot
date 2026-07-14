import moment from "moment";
import { IAmountData } from "@/types/app-context.interface";
import { getLimitSnapshot, ILimitSnapshot } from "@/helpers/limitSnapshot.helper";
import {
  SessionEncryptedNumber,
  getDecryptedNumber,
  encryptNumber,
} from "@/helpers/encryptedNumber.helper";
import { IEncryptedData } from "@/helpers/encrypt";
import {
  sumTransactionsForDay,
  sumTransactionsForMonth,
} from "@/helpers/transactionTotals.helper";

export interface IExpenseLimitSessionUpdates {
  savingsGoalExtraAmount?: IEncryptedData;
  savingsGoalCarryoverDate?: string;
  savingsGoalCarryoverAmount?: IEncryptedData;
}

export interface IExpenseLimitResult {
  totalExpensesToday: number;
  dailyLimit: number | null;
  isLimitExceeded: boolean;
  overspentAmount: number;
  snapshot: ILimitSnapshot | null;
  sessionUpdates: IExpenseLimitSessionUpdates;
}

export function computeExpenseLimitResult(input: {
  expenses: IAmountData[];
  income: IAmountData[];
  monthlySavingsGoal: number | null | undefined;
  savingsGoalCarryoverDate?: string;
  savingsGoalCarryoverAmount?: SessionEncryptedNumber;
  savingsGoalExtraAmount?: SessionEncryptedNumber;
}): IExpenseLimitResult {
  const now = moment();
  const totalExpensesToday = sumTransactionsForDay(input.expenses, now);
  const monthlyIncome = sumTransactionsForMonth(input.income, now);
  const monthlyExpenses = sumTransactionsForMonth(input.expenses, now);
  const monthlySavingsGoal = input.monthlySavingsGoal ?? null;

  const snapshot =
    monthlySavingsGoal != null
      ? getLimitSnapshot({
          monthlyIncome,
          monthlyExpenses,
          monthlySavingsGoal,
          daysInMonth: now.daysInMonth(),
          currentDayOfMonth: now.date(),
        })
      : null;

  const dailyLimit = snapshot != null ? snapshot.autoDailyLimit : null;
  const sessionUpdates: IExpenseLimitSessionUpdates = {};

  if (monthlySavingsGoal != null && dailyLimit != null) {
    const dayKey = now.format("YYYY-MM-DD");
    const previousAppliedToday =
      input.savingsGoalCarryoverDate === dayKey
        ? (getDecryptedNumber(input.savingsGoalCarryoverAmount) ?? 0)
        : 0;
    const currentSavedToday = Math.max(dailyLimit - totalExpensesToday, 0);
    const savingsGoalExtraDelta = Number(
      (currentSavedToday - previousAppliedToday).toFixed(2),
    );

    if (savingsGoalExtraDelta !== 0) {
      const currentSavingsGoalExtraAmount =
        getDecryptedNumber(input.savingsGoalExtraAmount) ?? 0;
      const adjustedSavingsGoalExtraAmount = Number(
        Math.max(
          currentSavingsGoalExtraAmount + savingsGoalExtraDelta,
          0,
        ).toFixed(2),
      );
      sessionUpdates.savingsGoalExtraAmount = encryptNumber(
        adjustedSavingsGoalExtraAmount,
      );
    }

    sessionUpdates.savingsGoalCarryoverDate = dayKey;
    sessionUpdates.savingsGoalCarryoverAmount = encryptNumber(currentSavedToday);
  }

  const isLimitExceeded = dailyLimit != null && totalExpensesToday > dailyLimit;
  const overspentAmount = isLimitExceeded
    ? totalExpensesToday - (dailyLimit as number)
    : 0;

  return {
    totalExpensesToday,
    dailyLimit,
    isLimitExceeded,
    overspentAmount,
    snapshot,
    sessionUpdates,
  };
}
