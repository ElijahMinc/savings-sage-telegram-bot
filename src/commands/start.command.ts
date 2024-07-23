import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { getTimezone } from "@/helpers/getTimezone.helper";

export class StartCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.start(async (ctx) => {
      ctx.reply(
        `Hello! Please choose primary tag first using /${COMMAND_NAMES.TAGS} command`
      );
    });
  }
}
