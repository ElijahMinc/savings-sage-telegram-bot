import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { xlmxService } from "@/services/XLMX.service";
import { COMMAND_NAMES } from "@/constants";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/services/TransactionService";
import { getDecryptedNumber } from "@/helpers/encryptedNumber.helper";
export class XLMXCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.ANALYTICS, async (ctx) => {
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const [expenses, income] = await Promise.all([
        transactionService.getExpensesByKey(key),
        transactionService.getIncomeByKey(key),
      ]);

      if ((!expenses || !expenses.length) && (!income || !income.length)) {
        return ctx.reply("There is no data");
      }

      const monthlySavingsGoal = getDecryptedNumber(
        ctx.session.monthlySavingsGoal,
      );

      const { filename, readStream } =
        xlmxService.getMonthlyAnalyticsReadStream(
          expenses,
          income,
          monthlySavingsGoal,
        );

      ctx.reply("Your monthly analytics report below:");

      ctx
        .replyWithDocument({
          source: readStream,
          filename,
        })
        .catch((error) => {
          console.error("Error sending document:", error);
        });
    });
  }
}
