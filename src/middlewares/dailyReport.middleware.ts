import cron from "node-cron";
import { IBotContext, SessionData } from "@/context/context.interface";
import { xlmxService } from "@/services/XLMX.service";
import cronTaskTrackerService from "@/services/CronTaskTrackerService";
import * as emoji from "node-emoji";
import { dailyReportCRONMask } from "@/constants";
import { mongoDbClient } from "@/db/connection";
import { transactionService } from "@/services/TransactionService";

const recycleEmoji = emoji.get("recycle");
const checkMarkEmoji = emoji.get("white_check_mark");

export const dailyReportMiddleware = () => (ctx: IBotContext, next: any) => {
  const session = ctx.session;
  const fromId = ctx?.from?.id;
  const chatId = ctx?.chat?.id;

  if (!fromId || !chatId) {
    next(ctx);

    return;
  }
  const key = `${ctx.chat.id}:${ctx.from.id}`;

  console.log(
    "BEFORE CRON:TASKS keys:",
    Array.from(cronTaskTrackerService.keys())
  );

  if (!!session?.isDailyFileReport) {
    next(ctx);

    return;
  }

  const cronTask = cron.schedule(
    dailyReportCRONMask,
    async () => {
      try {
        const userSessionFromDb = await transactionService.findTransactionByKey(
          key
        );

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

        const cronTaskBySessionId = cronTaskTrackerService.get(key);
        cronTaskBySessionId?.stop();
        cronTaskTrackerService.delete(key);

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
      timezone: "UTC",
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
