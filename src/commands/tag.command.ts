import { Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES, SCENES_NAMES } from "@/constants";

export class TagCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  handle(): void {
    this.tagsControlCommand();
  }

  tagsControlCommand() {
    this.bot.command(COMMAND_NAMES.TAGS, (ctx) => {
      (ctx as any).scene.enter(SCENES_NAMES.TAG_SCENE);
    });
  }

}
