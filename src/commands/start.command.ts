import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import cron from "node-cron";
import { getTimezone } from "@/helpers/getTimezone.helper";

export class StartCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.start(async (ctx) => {
      const timezone = await getTimezone();
      ctx.session.timezone = timezone;

      // cron.schedule(
      //   "* * * * *",
      //   async () => {
      //     console.log("Time to download the file!");

      //     try {
      //       // await downloadFile(fileUrl, localFilePath);
      //       ctx.reply("Please, install file with your data");
      //       console.log("File downloaded successfully");
      //     } catch (error) {
      //       console.error("Error downloading the file:", error);
      //     }
      //   },
      //   {
      //     scheduled: true,
      //     timezone: timezone, // Замените на вашу временную зону, например, 'America/New_York'
      //   }
      // );

      ctx.reply(
        `Hello! Please choose primary tag first using /${COMMAND_NAMES.TAGS} command`
      );
    });
  }
}
