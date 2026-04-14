import "dotenv/config";

import "../../register-aliases";

import { IConfigService } from "@config/config.interface";
import { ConfigService } from "@config/config.service";
import { IBotContext } from "@/types/app-context.interface";
import { connectToMongo } from "@/db/connection";

import { Telegraf } from "telegraf";
import { ensureAllIndexes } from "@/db/initialize";
import {
  expenseReminderWorker,
  TelegramExpenseReminderSender,
} from "@/modules/expense-reminder";

class WorkerApp {
  private readonly bot: Telegraf<IBotContext>;

  constructor(private readonly configService: IConfigService) {
    this.bot = new Telegraf<IBotContext>(this.configService.get("BOT_TOKEN"));
  }

  async init() {
    await connectToMongo();
    await ensureAllIndexes();

    expenseReminderWorker.run(new TelegramExpenseReminderSender(this.bot));
  }
}

const workerApp = new WorkerApp(new ConfigService());

const start = async () => {
  try {
    console.time("Launching worker");
    await workerApp.init();
    console.timeEnd("Launching worker");
  } catch (error) {
    console.error("Failed to start worker app", error);
    process.exit(1);
  }
};

void start();
