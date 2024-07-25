import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES, START_COMMAND_MESSAGE } from "@/constants";
import * as emoji from "node-emoji";

export class StartCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.start(async (ctx) => {
      ctx.replyWithMarkdown(START_COMMAND_MESSAGE);
    });

    this.bot.on("message", async (ctx) => {
      ctx.reply(
        `Try these commands: /${COMMAND_NAMES.TAGS}, /${COMMAND_NAMES.CHANGE_MODE}, /${COMMAND_NAMES.TRANSACTION}`
      );
    });
  }
}
