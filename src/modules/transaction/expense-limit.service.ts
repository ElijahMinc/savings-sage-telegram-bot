import { format, getDaysInMonth } from "date-fns";
import { IAmountData } from "@/types/app-context.interface";
import { getLimitSnapshot, ILimitSnapshot } from "@/helpers/limitSnapshot.helper";
import {
  sumTransactionsForDay,
  sumTransactionsForMonth,
} from "@/helpers/transactionTotals.helper";

export interface IExpenseLimitSessionUpdates {
  savingsGoalExtraAmount?: number;
  savingsGoalCarryoverDate?: string;
  savingsGoalCarryoverAmount?: number;
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
  savingsGoalCarryoverAmount?: number;
  savingsGoalExtraAmount?: number;
}): IExpenseLimitResult {
  const now = new Date();
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
          daysInMonth: getDaysInMonth(now),
          currentDayOfMonth: now.getDate(),
        })
      : null;

  const dailyLimit = snapshot != null ? snapshot.autoDailyLimit : null;
  const sessionUpdates: IExpenseLimitSessionUpdates = {};

  if (monthlySavingsGoal != null && dailyLimit != null) {
    const dayKey = format(now, "yyyy-MM-dd");
    const previousAppliedToday =
      input.savingsGoalCarryoverDate === dayKey
        ? (input.savingsGoalCarryoverAmount ?? 0)
        : 0;
    const currentSavedToday = Math.max(dailyLimit - totalExpensesToday, 0);
    const savingsGoalExtraDelta = currentSavedToday - previousAppliedToday;

    if (savingsGoalExtraDelta !== 0) {
      const currentSavingsGoalExtraAmount = input.savingsGoalExtraAmount ?? 0;
      sessionUpdates.savingsGoalExtraAmount = Math.max(
        currentSavingsGoalExtraAmount + savingsGoalExtraDelta,
        0,
      );
    }

    sessionUpdates.savingsGoalCarryoverDate = dayKey;
    sessionUpdates.savingsGoalCarryoverAmount = currentSavedToday;
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
