import { Telegraf } from "telegraf";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES, SCENES_NAMES } from "@/constants";

export class TransactionCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.transactionsCommand();
  }

  transactionsCommand() {
    this.bot.command(COMMAND_NAMES.TRANSACTIONS, (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).scene.enter(SCENES_NAMES.TRANSACTIONS_SCENE);
    });
  }
}
