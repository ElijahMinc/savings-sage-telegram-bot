import cron from "node-cron";
import { IBotContext } from "@/context/context.interface";
import { xlmxService } from "@/services/XLMX.service";
import cronTaskTrackerService from "@/services/CronTaskTrackerService";
import * as emoji from "node-emoji";
import { dailyReportCRONMask } from "@/constants";

const recycleEmoji = emoji.get("recycle");
const checkMarkEmoji = emoji.get("white_check_mark");

export const dailyReportMiddleware = () => (ctx: IBotContext, next: any) => {
  const session = ctx.session;
  const id = ctx?.from?.id;

  if (!id) {
    next(ctx);

    return;
  }

  if (!session?.isDailyFileReport) {
    next(ctx);

    return;
  }

  session.isDailyFileReport = true;

  const cronTask = cron.schedule(
    dailyReportCRONMask,
    () => {
      const data = session?.expenses;

      if (!data || !data?.length) {
        return;
      }

      const { filename, readStream } = xlmxService.getReadStreamByData(data);

      ctx
        .replyWithDocument({
          source: readStream,
          filename,
        })
        .then(() => {
          session.expenses = [];
          session.isDailyFileReport = false;
          const cronTaskBySessionId = cronTaskTrackerService.get(id.toString());

          cronTaskBySessionId?.stop();
          cronTaskTrackerService.delete(id.toString());
        })
        .then(() => {
          ctx.replyWithMarkdown(
            `${checkMarkEmoji} The expense session has been recorded and saved in the XLSX file *${filename}* for the monthly report (UTC time).
	 
${recycleEmoji} *The session has been reset in the application*
  `
          );
        })
        .catch((error) => {
          console.error("Error sending document:", error);
        });
    },
    {
      scheduled: true,
      timezone: "UTC",
    }
  );

  cronTaskTrackerService.set(id.toString(), cronTask);

  next(ctx);
};
