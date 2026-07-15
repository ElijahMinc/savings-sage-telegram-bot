import { Telegraf } from "telegraf";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/modules/transaction";
import { formatAmount } from "@/helpers/money.helper";
import {
  endOfDay,
  endOfMonth,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
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

      const now = new Date();
      const [spentToday, monthlyIncome, monthlyExpenses] = await Promise.all([
        transactionService.sumExpensesInRange(key, startOfDay(now), endOfDay(now)),
        transactionService.sumIncomeInRange(
          key,
          startOfMonth(now),
          endOfMonth(now),
        ),
        transactionService.sumExpensesInRange(
          key,
          startOfMonth(now),
          endOfMonth(now),
        ),
      ]);

      const monthlySavingsGoal = ctx.session.monthlySavingsGoal;
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
          ? `Today: ${formatAmount(spentToday)} / ${formatAmount(amountPerDay)} EUR`
          : `Today: ${formatAmount(spentToday)} EUR`;

      const overspendAmount = monthlyExpenses - monthlyIncome;
      const savingsGoalLine =
        monthlySavingsGoal != null
          ? `${formatAmount(monthlySavingsGoal)} EUR`
          : `Not set. Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`;
      const monthBalanceWithSavingsGoalLine =
        monthlySavingsGoal != null
          ? `${formatAmount(monthlyIncome - monthlyExpenses - monthlySavingsGoal)} EUR`
          : `Not available. Set /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`;

      const message =
        overspendAmount > 0
          ? `Balance

${todayLine}

${emoji.get("warning")} Over budget by ${formatAmount(overspendAmount)} EUR
(Income ${formatAmount(monthlyIncome)} / Expenses ${formatAmount(monthlyExpenses)})

Month balance (with savings goal): ${monthBalanceWithSavingsGoalLine}

Savings goal: ${savingsGoalLine}`
          : `Balance

${todayLine}

Month balance: ${formatAmount(monthlyIncome - monthlyExpenses)} EUR ${emoji.get("white_check_mark")}
(${formatAmount(monthlyIncome)} in / ${formatAmount(monthlyExpenses)} out)

Month balance (with savings goal): ${monthBalanceWithSavingsGoalLine}

Savings goal: ${savingsGoalLine}`;

      await ctx.reply(message);
    });
  }
}
