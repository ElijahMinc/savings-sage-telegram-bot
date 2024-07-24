import "dotenv/config";

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
import { IBotContext } from "@context/context.interface";
import { ModeCommand } from "@commands/mode.command";
import { TagCommand } from "@commands/tag.command";
import { TagScene } from "@scenes/tag.scene";
import { Scenario } from "./scenes/scene.class";
import { TransactionCommand } from "./commands/transaction.command";
import { ExpenseTransactionScene } from "./scenes/expense-transaction.scene";
import { XLMXCommand } from "./commands/xlmx.command";
import { MongoClient } from "mongodb";
import { session } from "telegraf-session-mongodb";

const CONNECT_DB = process.env.MONGODB_CONNECT_DB_URL!.replace(
  "<password>",
  process.env.MONGODB_CONNECT_DB_PASSWORD!
);

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
    const client = await MongoClient.connect(CONNECT_DB);
    const db = client.db();
    console.log("Connected to DB");

    const sessions = session(db, {
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
