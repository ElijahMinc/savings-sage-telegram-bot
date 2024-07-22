import "module-alias/register";

import { Scenes, Telegraf } from "telegraf";
import { Command } from "@commands/command.class";
import { StartCommand } from "@commands/start.command";
import LocalSession from "telegraf-session-local";
import {
  commands,
  DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS,
  // defaultStateValues,
} from "@/constants";
import { IConfigService } from "@config/config.interface";
import { ConfigService } from "@config/config.service";
import { IBotContext, SessionData } from "@context/context.interface";
import { ModeCommand } from "@commands/mode.command";
import { TagCommand } from "@commands/tag.command";
import { TagScene } from "@scenes/tag.scene";
import { Scenario } from "./scenes/scene.class";
import { TransactionCommand } from "./commands/transaction.command";
import { ExpenseTransactionScene } from "./scenes/expense-transaction.scene";
import { XLMXCommand } from "./commands/xlmx.command";

class Bot {
  bot: Telegraf<IBotContext>;
  commands: Command[] = [];
  scenarios: Scenario[] = [];

  constructor(private readonly configService: IConfigService) {
    this.bot = new Telegraf<IBotContext>(this.configService.get("BOT_TOKEN"));

    this.bot.use(
      new LocalSession<SessionData>({
        database: "sessions.json",
        // state: defaultStateValues,
      }).middleware()
    );
  }

  init() {
    this.bot.telegram.setMyCommands(commands);

    this.commands = [
      // START
      new StartCommand(this.bot),

      // Scene to commands trigger
      new XLMXCommand(this.bot),
      new ModeCommand(this.bot),
      new TagCommand(this.bot),
      new TransactionCommand(this.bot),
    ];

    this.scenarios = [new TagScene(), new ExpenseTransactionScene()];
    const scenes: any[] = [];

    this.scenarios.forEach((scenario) => {
      scenario.handle();
      scenes.push(scenario.scene);
    });

    const stages: any = new Scenes.Stage(scenes, {
      // ttl: DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS,
    });

    this.bot.use(stages.middleware());

    for (const command of this.commands) {
      command.handle();
    }

    this.bot.launch();
  }
}

const bot = new Bot(new ConfigService());

bot.init();
