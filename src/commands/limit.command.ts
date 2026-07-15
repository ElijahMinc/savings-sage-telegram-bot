import { Telegraf } from "telegraf";
import * as emoji from "node-emoji";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { containsStrictNumber } from "@/helpers/containsStrictNumber.helper";
import { formatCents, toCents } from "@/helpers/money.helper";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/modules/transaction";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import { getDaysInMonth } from "date-fns";
import { sumTransactionsForMonth } from "@/helpers/transactionTotals.helper";

export class SavingsGoalCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.SAVINGS_GOAL, async (ctx) => {
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const rawInput = ctx.message.text.split(" ").slice(1).join(" ").trim();

      if (["off", "none", "reset", "clear"].includes(rawInput.toLowerCase())) {
        ctx.session.monthlySavingsGoal = undefined;
        ctx.session.savingsGoalCarryoverDate = undefined;
        ctx.session.savingsGoalExtraAmount = undefined;
        ctx.session.savingsGoalCarryoverAmount = undefined;
        await ctx.reply("Monthly savings goal has been removed.");
        return;
      }

      if (rawInput) {
        if (!containsStrictNumber(rawInput)) {
          await ctx.reply(
            `Invalid value. Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal> (example: /${COMMAND_NAMES.SAVINGS_GOAL} 500)`,
          );
          return;
        }

        const goalCents = toCents(rawInput);

        if (goalCents == null || goalCents <= 0) {
          await ctx.reply("Monthly savings goal must be greater than 0.");
          return;
        }

        ctx.session.monthlySavingsGoal = goalCents;
        ctx.session.savingsGoalCarryoverDate = undefined;
        ctx.session.savingsGoalExtraAmount = undefined;
        ctx.session.savingsGoalCarryoverAmount = undefined;
      }

      const monthlySavingsGoal = ctx.session.monthlySavingsGoal;

      if (monthlySavingsGoal == null) {
        await ctx.reply(
          `Savings goal is not set. Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`,
        );
        return;
      }

      const savingsGoalExtraAmount = ctx.session.savingsGoalExtraAmount ?? 0;

      const [income, expenses] = await Promise.all([
        transactionService.getIncomeByKey(key),
        transactionService.getExpensesByKey(key),
      ]);
      const monthlyIncome = sumTransactionsForMonth(income);
      const monthlyExpenses = sumTransactionsForMonth(expenses);
      const now = new Date();
      const snapshot = getLimitSnapshot({
        monthlyIncome,
        monthlyExpenses,
        monthlySavingsGoal,
        daysInMonth: getDaysInMonth(now),
        currentDayOfMonth: now.getDate(),
      });

      const feasibilityMessage =
        snapshot.remainingExpenseBudget < 0
          ? `\n\n${emoji.get(
              "warning",
            )} Warning: expense budget is already exceeded by ${formatCents(
              Math.abs(snapshot.remainingExpenseBudget),
            )} EUR.`
          : "";

      await ctx.reply(
        `${emoji.get("dart")} Monthly savings goal: ${formatCents(
          monthlySavingsGoal,
        )} EUR.

${emoji.get("chart_with_upwards_trend")} Current month income: ${formatCents(
          monthlyIncome,
        )} EUR.
${emoji.get("money_with_wings")} Current month expenses: ${formatCents(
          monthlyExpenses,
        )} EUR.

${emoji.get("gem")} Saved above goal: ${formatCents(savingsGoalExtraAmount)} EUR.

${emoji.get("purse")} Remaining expense budget: ${formatCents(
          snapshot.remainingExpenseBudget,
        )} EUR.
${emoji.get("calendar")} Auto daily expense limit: ${formatCents(
          snapshot.autoDailyLimit,
        )} EUR for ${snapshot.remainingDays} remaining day(s).${feasibilityMessage}`,
      );
    });
  }
}
