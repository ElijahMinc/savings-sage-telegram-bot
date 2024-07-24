import { Telegraf } from "telegraf";
import { IBotContext, SceneContexts } from "@context/context.interface";
import { Command } from "./command.class";
import { xlmxService } from "@/services/XLMX.service";
import { COMMAND_NAMES } from "@/constants";
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

      const { filename, readStream } = xlmxService.getReadStreamByData(data);

      ctx.reply("Your report below:");

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
