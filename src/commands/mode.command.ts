import { Markup, Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES, START_COMMAND_MESSAGE } from "@/constants";

export class ModeCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.CHANGE_MODE, async (ctx) => {
      ctx.reply(
        "Select a specific mode from the list below",
        Markup.inlineKeyboard([
          Markup.button.callback("EXPENSE", "expense"),
          // Markup.button.callback("INCOME", "income"),
        ])
      );
    });

    this.bot.action("expense", async (ctx) => {
      ctx.session.mode = "expense";

      await ctx.editMessageText(`Your mode is ${ctx.session.mode}`);
      await ctx.reply(START_COMMAND_MESSAGE);
    });

    this.bot.action("income", async (ctx) => {
      ctx.session.mode = "income";

      await ctx.editMessageText(`Your mode is ${ctx.session.mode}`);
      await ctx.reply(START_COMMAND_MESSAGE);
    });
  }
}
