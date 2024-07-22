import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { xlmxService } from "@/services/XLMX.service";
import { COMMAND_NAMES } from "@/constants";
import moment from "moment";

export class XLMXCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.DOWNLOAD_ANALYTICS, (ctx) => {
      const data = (ctx as any).session?.expenses;

      if (!data || !data?.length) {
        return ctx.reply("There is no data");
      }

      const { readStream, startDate, endDate, filteredData } =
        xlmxService.generateXlsxStream(data);

      const allToday = filteredData.every((item) =>
        moment(item.created_date).isSame(moment(), "day")
      );

      const filename = allToday
        ? `transactions_${moment().format("DD-MM-YYYY")}.xlsx`
        : `transactions_${startDate.format("DD-MM-YYYY")}_to_${endDate.format(
            "DD-MM-YYYY"
          )}.xlsx`;

      ctx.reply("Your report with :");

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
