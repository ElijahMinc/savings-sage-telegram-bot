import cron from "node-cron";
import { IBotContext, SessionData } from "@/context/context.interface";
import { xlmxService } from "@/services/XLMX.service";
import cronTaskTrackerService from "@/services/CronTaskTrackerService";
import * as emoji from "node-emoji";
import { dailyReportCRONMask } from "@/constants";
import { transactionService } from "@/services/TransactionService";

const recycleEmoji = emoji.get("recycle");
const checkMarkEmoji = emoji.get("white_check_mark");

export const dailyReportMiddleware =
  () => async (ctx: IBotContext, next: any) => {
    const session = ctx.session;
    const fromId = ctx?.from?.id;
    const chatId = ctx?.chat?.id;

    if (!fromId || !chatId) {
      next(ctx);

      return;
    }

    const key = `${ctx.chat.id}:${ctx.from.id}`;

    const sessionFromDb = await transactionService.findTransactionByKey(key);

    console.log(
      "BEFORE CRON:TASKS keys:",
      Array.from(cronTaskTrackerService.keys())
    );

    console.log(`Current session of ${key} user`, sessionFromDb);

    const cronUserTask = cronTaskTrackerService.get(key);

    if (!!cronUserTask && !!sessionFromDb?.isDailyFileReport) {
      next(ctx);

      return;
    }

    const cronTask = cron.schedule(
      dailyReportCRONMask,
      async () => {
        setImmediate(() => {
          cronTask.stop();
          cronTaskTrackerService.delete(key);

          console.log(`Immediately finalized for: ${key}`);
        });

        try {
          const userSessionFromDb =
            await transactionService.findTransactionByKey(key);

          if (!userSessionFromDb) return;

          const expenses = userSessionFromDb?.expenses || [];

          if (!expenses || !expenses?.length) {
            return;
          }

          const { filename, readStream } =
            xlmxService.getReadStreamByData(expenses);

          await transactionService.updateTransactionByKey(key, {
            expenses: [],
            isDailyFileReport: false,
          });

          await ctx.replyWithDocument({
            source: readStream,
            filename,
          });

          await ctx.replyWithMarkdown(
            `${checkMarkEmoji} The expense session has been recorded and saved in the XLSX file *${filename}* for the daily report (UTC time).
     
${recycleEmoji} *The session has been reset in the application*`
          );
        } catch (error) {
          console.log("CRON ERROR", error);
        }
      },
      {
        scheduled: true,
        timezone: "UTC",
        name: key,
      }
    );

    session.isDailyFileReport = true;
    cronTaskTrackerService.set(key, cronTask);

    console.log(
      "AFTER CRON:TASKS keys",
      Array.from(cronTaskTrackerService.keys())
    );

    next(ctx);
  };
