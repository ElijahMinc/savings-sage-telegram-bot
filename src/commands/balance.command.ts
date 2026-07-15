import { Telegraf } from "telegraf";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/modules/transaction";
import { formatCents } from "@/helpers/money.helper";
import { getDaysInMonth } from "date-fns";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import {
  sumTransactionsForDay,
  sumTransactionsForMonth,
} from "@/helpers/transactionTotals.helper";
import * as emoji from "node-emoji";

export class BalanceCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.BALANCE, async (ctx) => {
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const [expenses, income] = await Promise.all([
        transactionService.getExpensesByKey(key),
        transactionService.getIncomeByKey(key),
      ]);

      const spentToday = sumTransactionsForDay(expenses);
      const monthlyIncome = sumTransactionsForMonth(income);
      const monthlyExpenses = sumTransactionsForMonth(expenses);
      const monthlySavingsGoal = ctx.session.monthlySavingsGoal;
      const now = new Date();
      const dailyLimitSnapshot =
        monthlySavingsGoal != null
          ? getLimitSnapshot({
              monthlyIncome,
              monthlyExpenses,
              monthlySavingsGoal,
              daysInMonth: getDaysInMonth(now),
              currentDayOfMonth: now.getDate(),
            })
          : null;
      const amountPerDay =
        dailyLimitSnapshot != null ? dailyLimitSnapshot.autoDailyLimit : null;
      const todayLine =
        amountPerDay != null
          ? `Today: ${formatCents(spentToday)} / ${formatCents(amountPerDay)} EUR`
          : `Today: ${formatCents(spentToday)} EUR`;

      const overspendAmount = monthlyExpenses - monthlyIncome;
      const savingsGoalLine =
        monthlySavingsGoal != null
          ? `${formatCents(monthlySavingsGoal)} EUR`
          : `Not set. Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`;
      const monthBalanceWithSavingsGoalLine =
        monthlySavingsGoal != null
          ? `${formatCents(monthlyIncome - monthlyExpenses - monthlySavingsGoal)} EUR`
          : `Not available. Set /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`;

      const message =
        overspendAmount > 0
          ? `Balance

${todayLine}

${emoji.get("warning")} Over budget by ${formatCents(overspendAmount)} EUR
(Income ${formatCents(monthlyIncome)} / Expenses ${formatCents(monthlyExpenses)})

Month balance (with savings goal): ${monthBalanceWithSavingsGoalLine}

Savings goal: ${savingsGoalLine}`
          : `Balance

${todayLine}

Month balance: ${formatCents(monthlyIncome - monthlyExpenses)} EUR ${emoji.get("white_check_mark")}
(${formatCents(monthlyIncome)} in / ${formatCents(monthlyExpenses)} out)

Month balance (with savings goal): ${monthBalanceWithSavingsGoalLine}

Savings goal: ${savingsGoalLine}`;

      await ctx.reply(message);
    });
  }
}
