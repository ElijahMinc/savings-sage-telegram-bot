import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES, SCENES_NAMES } from "@/constants";

export class TransactionCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.transactionControlCommand();
  }

  transactionControlCommand() {
    this.bot.command(COMMAND_NAMES.TRANSACTION, (ctx) => {
      const mode = ctx.session.mode;

      if (!mode) {
        ctx.reply(
          `Please, choose mode first using command /${COMMAND_NAMES.CHANGE_MODE}`
        );
        return;
      }

      (ctx as any).scene.enter(
        mode === "expense"
          ? SCENES_NAMES.EXPENSES_SCENE
          : SCENES_NAMES.INCOME_SCENE
      );
    });
  }
}
