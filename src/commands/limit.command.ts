import { Telegraf } from "telegraf";
import * as emoji from "node-emoji";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { containsStrictNumber } from "@/helpers/containsStrictNumber.helper";
import { formatAmount, parseAmount } from "@/helpers/money.helper";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/modules/transaction";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import { endOfMonth, getDaysInMonth, startOfMonth } from "date-fns";

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

        const goal = parseAmount(rawInput);

        if (goal == null || goal <= 0) {
          await ctx.reply("Monthly savings goal must be greater than 0.");
          return;
        }

        ctx.session.monthlySavingsGoal = goal;
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

      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const [monthlyIncome, monthlyExpenses] = await Promise.all([
        transactionService.sumIncomeInRange(key, monthStart, monthEnd),
        transactionService.sumExpensesInRange(key, monthStart, monthEnd),
      ]);
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
            )} Warning: expense budget is already exceeded by ${formatAmount(
              Math.abs(snapshot.remainingExpenseBudget),
            )} EUR.`
          : "";

      await ctx.reply(
        `${emoji.get("dart")} Monthly savings goal: ${formatAmount(
          monthlySavingsGoal,
        )} EUR.

${emoji.get("chart_with_upwards_trend")} Current month income: ${formatAmount(
          monthlyIncome,
        )} EUR.
${emoji.get("money_with_wings")} Current month expenses: ${formatAmount(
          monthlyExpenses,
        )} EUR.

${emoji.get("gem")} Saved above goal: ${formatAmount(savingsGoalExtraAmount)} EUR.

${emoji.get("purse")} Remaining expense budget: ${formatAmount(
          snapshot.remainingExpenseBudget,
        )} EUR.
${emoji.get("calendar")} Auto daily expense limit: ${formatAmount(
          snapshot.autoDailyLimit,
        )} EUR for ${snapshot.remainingDays} remaining day(s).${feasibilityMessage}`,
      );
    });
  }
}
