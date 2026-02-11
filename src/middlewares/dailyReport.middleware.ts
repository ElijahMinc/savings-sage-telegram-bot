import cron from "node-cron";
import { IBotContext } from "@/context/context.interface";
import { xlmxService } from "@/services/XLMX.service";
import * as emoji from "node-emoji";
import { dailyReportCRONMask } from "@/constants";
import { transactionService } from "@/services/TransactionService";
import { reportJobService } from "@/services/ReportJobService";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";

const recycleEmoji = emoji.get("recycle");
const checkMarkEmoji = emoji.get("white_check_mark");

export const dailyReportMiddleware =
  () => async (ctx: IBotContext, next: () => Promise<void>) => {
    const key = getSessionKeyFromContext(ctx);

    if (!key) {
      await next();
      return;
    }

    const alreadyPending = await reportJobService.hasPendingJob(key);

    if (alreadyPending) {
      await next();
      return;
    }

    const created = await reportJobService.tryCreatePendingJob(key, new Date());

    if (!created) {
      await next();
      return;
    }

    const cronTask = cron.schedule(
      dailyReportCRONMask,
      async () => {
        setImmediate(() => {
          cronTask.stop();
        });

        try {
          const expenses = await transactionService.getExpensesByKey(key);

          if (!expenses.length) {
            await reportJobService.clearPendingJob(key);
            return;
          }

          const { filename, readStream } =
            xlmxService.getReadStreamByData(expenses);

          await transactionService.clearExpensesByKey(key);

          await ctx.replyWithDocument({
            source: readStream,
            filename,
          });

          await ctx.replyWithMarkdown(
            `${checkMarkEmoji} The expense session has been recorded and saved in the XLSX file *${filename}* for the daily report (UTC time).
     
${recycleEmoji} *The session has been reset in the application*`,
          );

          await reportJobService.markCompleted(key);
        } catch (error) {
          await reportJobService.clearPendingJob(key);
          console.log("CRON ERROR", error);
        }
      },
      {
        scheduled: true,
        timezone: "UTC",
        name: key,
      },
    );

    await next();
  };
