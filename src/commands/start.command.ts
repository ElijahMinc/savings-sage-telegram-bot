import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";

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

    this.bot.on("message", async (ctx) => {
      ctx.reply(
        `Try these commands: /${COMMAND_NAMES.TAGS}, /${COMMAND_NAMES.CHANGE_MODE}, /${COMMAND_NAMES.TRANSACTION}`
      );
    });
  }
}
