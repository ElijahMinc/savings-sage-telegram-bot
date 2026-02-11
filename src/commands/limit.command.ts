import { Telegraf } from "telegraf";
import * as emoji from "node-emoji";
import { IBotContext, IAmountData } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { containsStrictNumber } from "@/helpers/containsStrictNumber.helper";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/services/TransactionService";
import { decrypt } from "@/helpers/decrypt";
import { IEncryptedData } from "@/helpers/encrypt";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import moment from "moment";
import {
  encryptNumber,
  getDecryptedNumber,
} from "@/helpers/encryptedNumber.helper";

export class SavingsGoalCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  private getNumericAmount(amount: IAmountData["amount"]): number {
    if (typeof amount === "number") {
      return amount;
    }

    return Number(decrypt(amount as IEncryptedData));
  }

  private getCurrentMonthIncomeTotal(income: IAmountData[]) {
    const now = moment();

    return income
      .filter((item) => moment(item.created_date).isSame(now, "month"))
      .reduce((acc, item) => acc + this.getNumericAmount(item.amount), 0);
  }

  private getCurrentMonthExpenseTotal(expenses: IAmountData[]) {
    const now = moment();

    return expenses
      .filter((item) => moment(item.created_date).isSame(now, "month"))
      .reduce((acc, item) => acc + this.getNumericAmount(item.amount), 0);
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

        const goal = Number(rawInput);

        if (!Number.isFinite(goal) || goal <= 0) {
          await ctx.reply("Monthly savings goal must be greater than 0.");
          return;
        }

        ctx.session.monthlySavingsGoal = encryptNumber(goal);
        ctx.session.savingsGoalCarryoverDate = undefined;
        ctx.session.savingsGoalExtraAmount = undefined;
        ctx.session.savingsGoalCarryoverAmount = undefined;
      }

      const monthlySavingsGoal = getDecryptedNumber(
        ctx.session.monthlySavingsGoal,
      );

      if (monthlySavingsGoal == null) {
        await ctx.reply(
          `Savings goal is not set. Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly_savings_goal>.`,
        );
        return;
      }

      const savingsGoalExtraAmount =
        getDecryptedNumber(ctx.session.savingsGoalExtraAmount) ?? 0;

      const [income, expenses] = await Promise.all([
        transactionService.getIncomeByKey(key),
        transactionService.getExpensesByKey(key),
      ]);
      const monthlyIncome = this.getCurrentMonthIncomeTotal(income);
      const monthlyExpenses = this.getCurrentMonthExpenseTotal(expenses);
      const now = moment();
      const snapshot = getLimitSnapshot({
        monthlyIncome,
        monthlyExpenses,
        monthlySavingsGoal,
        daysInMonth: now.daysInMonth(),
        currentDayOfMonth: now.date(),
      });

      const feasibilityMessage =
        snapshot.remainingExpenseBudget < 0
          ? `\n\n${emoji.get(
              "warning",
            )} Warning: expense budget is already exceeded by ${getFixedAmount(
              Math.abs(snapshot.remainingExpenseBudget),
            )} EUR.`
          : "";

      await ctx.reply(
        `${emoji.get("dart")} Monthly savings goal: ${getFixedAmount(
          monthlySavingsGoal,
        )} EUR.

${emoji.get("chart_with_upwards_trend")} Current month income: ${getFixedAmount(
          monthlyIncome,
        )} EUR.
${emoji.get("money_with_wings")} Current month expenses: ${getFixedAmount(
          monthlyExpenses,
        )} EUR.

${emoji.get("gem")} Saved above goal: ${getFixedAmount(savingsGoalExtraAmount)} EUR.

${emoji.get("purse")} Remaining expense budget: ${getFixedAmount(
          snapshot.remainingExpenseBudget,
        )} EUR.
${emoji.get("calendar")} Auto daily expense limit: ${getFixedAmount(
          snapshot.autoDailyLimit,
        )} EUR for ${snapshot.remainingDays} remaining day(s).${feasibilityMessage}`,
      );
    });
  }
}




