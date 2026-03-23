export interface ILimitSnapshot {
  remainingDays: number;
  monthlyExpenseBudget: number;
  remainingExpenseBudget: number;
  remainingIncomeBalance: number;
  displayRemainingExpenseBudget: number;
  isIncomeExceeded: boolean;
  autoDailyLimit: number;
}

export const getLimitSnapshot = (input: {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsGoal: number;
  daysInMonth: number;
  currentDayOfMonth: number;
}): ILimitSnapshot => {
  const remainingDays = Math.max(
    input.daysInMonth - input.currentDayOfMonth + 1,
    1,
  );

  const monthlyExpenseBudget = input.monthlyIncome - input.monthlySavingsGoal;
  const remainingExpenseBudget = monthlyExpenseBudget - input.monthlyExpenses;
  const remainingIncomeBalance = input.monthlyIncome - input.monthlyExpenses;
  const isIncomeExceeded = remainingIncomeBalance < 0;
  const displayRemainingExpenseBudget = isIncomeExceeded
    ? remainingIncomeBalance
    : remainingExpenseBudget;
  const autoDailyLimit = Math.max(remainingExpenseBudget / remainingDays, 0);

  return {
    remainingDays,
    monthlyExpenseBudget,
    remainingExpenseBudget,
    remainingIncomeBalance,
    displayRemainingExpenseBudget,
    isIncomeExceeded,
    autoDailyLimit,
  };
};
