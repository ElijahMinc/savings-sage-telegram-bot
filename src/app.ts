import "dotenv/config";

import "./register-aliases";

import { Scenes, Telegraf } from "telegraf";
import { Command } from "@commands/command.class";
import { StartCommand } from "@commands/start.command";
import { commands } from "@/constants";
import { IConfigService } from "@config/config.interface";
import { ConfigService } from "@config/config.service";
import { IBotContext } from "@context/context.interface";
import { Scenario } from "./scenes/scene.class";
import { TransactionCommand } from "./commands/transaction.command";
import { ExpenseTransactionScene } from "./scenes/expense-transaction.scene";
import { IncomeTransactionScene } from "./scenes/income-transaction.scene";
import { TransactionsScene } from "./scenes/transactions.scene";
import { XLMXCommand } from "./commands/xlmx.command";
import { ReminderCommand } from "./commands/reminder.command";
import { BalanceCommand } from "./commands/balance.command";
import { SavingsGoalCommand } from "./commands/limit.command";
import { session } from "telegraf-session-mongodb";
import { connectToMongo, mongoDbClient } from "./db/connection";
import { defaultSessionMiddleware } from "./middlewares/defaultSession.middleware";
import { getSessionKeyFromContext } from "./helpers/getSessionKey.helper";
import { expenseReminderWorker } from "./workers/expenseReminder.worker";

class Bot {
  bot: Telegraf<IBotContext>;
  commands: Command[] = [];
  scenarios: Scenario[] = [];

  constructor(private readonly configService: IConfigService) {
    this.bot = new Telegraf<IBotContext>(
      process.env.BOT_TOKEN! || this.configService.get("BOT_TOKEN"),
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
      new BalanceCommand(this.bot),
      new SavingsGoalCommand(this.bot),
      new ReminderCommand(this.bot),
      new TransactionCommand(this.bot),

      // START
      new StartCommand(this.bot),
    ];

    this.scenarios = [
      new ExpenseTransactionScene(),
      new IncomeTransactionScene(),
      new TransactionsScene(),
    ];
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

    expenseReminderWorker.start(this.bot);

    console.time("Launching time");
    this.bot.launch();
    console.timeEnd("Launching time");
  }
}

const bot = new Bot(new ConfigService());

const start = async () => {
  try {
    await connectToMongo();

    const sessions = session(mongoDbClient, {
      sessionName: "session",
      collectionName: "sessions",
      sessionKeyFn: ((ctx: IBotContext) =>
        getSessionKeyFromContext(ctx) as any) as any,
    });

    bot.bot.use(sessions);
    bot.bot.use(defaultSessionMiddleware());

    bot.init();
  } catch (error) {
    console.log(error);
  }
};

start();
