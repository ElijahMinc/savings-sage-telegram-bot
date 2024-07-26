import "dotenv/config";

import "module-alias/register";

import { Scenes, Telegraf } from "telegraf";
import { Command } from "@commands/command.class";
import { StartCommand } from "@commands/start.command";
import { commands } from "@/constants";
import { IConfigService } from "@config/config.interface";
import { ConfigService } from "@config/config.service";
import { IBotContext } from "@context/context.interface";
import { ModeCommand } from "@commands/mode.command";
import { TagCommand } from "@commands/tag.command";
import { TagScene } from "@scenes/tag.scene";
import { Scenario } from "./scenes/scene.class";
import { TransactionCommand } from "./commands/transaction.command";
import { ExpenseTransactionScene } from "./scenes/expense-transaction.scene";
import { XLMXCommand } from "./commands/xlmx.command";
import { Db, MongoClient } from "mongodb";
import { session } from "telegraf-session-mongodb";
import { dailyReportMiddleware } from "./middlewares/dailyReport.middleware";
import { mongoDbClient } from "./db/connection";

class Bot {
  bot: Telegraf<IBotContext>;
  commands: Command[] = [];
  scenarios: Scenario[] = [];

  constructor(private readonly configService: IConfigService) {
    this.bot = new Telegraf<IBotContext>(
      process.env.BOT_TOKEN! || this.configService.get("BOT_TOKEN")
    );

    this.bot.use(Telegraf.log()).middleware();

    // this.bot.use(
    //   new LocalSession<SessionData>({
    //     database: "sessions.json",
    //   }).middleware()
    // ); // LOCAL SESSION
  }

  init() {
    this.bot.telegram.setMyCommands(commands);

    this.commands = [
      // Scene to commands trigger
      new XLMXCommand(this.bot),
      new ModeCommand(this.bot),
      new TagCommand(this.bot),
      new TransactionCommand(this.bot),

      // START
      new StartCommand(this.bot),
    ];

    this.scenarios = [new TagScene(), new ExpenseTransactionScene()];
    const scenes: any[] = [];

    this.scenarios.forEach((scenario) => {
      scenario.handle();
      scenes.push(scenario.scene);
    });

    const stages: any = new Scenes.Stage(scenes);

    this.bot.use(dailyReportMiddleware());

    this.bot.use(stages.middleware());

    for (const command of this.commands) {
      command.handle();
    }

    console.time("Launching time");
    this.bot.launch();
    console.timeEnd("Launching time");
  }
}

const bot = new Bot(new ConfigService());

const start = async () => {
  try {
    const sessions = session(mongoDbClient, {
      sessionName: "session",
      collectionName: "sessions",
    });

    bot.bot.use(sessions);

    bot.init();
  } catch (error) {
    console.log(error);
  }
};

start();
