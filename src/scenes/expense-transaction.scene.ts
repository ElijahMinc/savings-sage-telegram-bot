import { SCENES_NAMES } from "@/constants";
import { Context, Markup, Scenes } from "telegraf";
import { Scenario } from "./scene.class";
import { Update } from "telegraf/typings/core/types/typegram";
import { CURRENCIES, IAmountData } from "@/context/context.interface";
import moment from "moment";
import "moment-timezone";
import { containsSlash } from "@/helpers/containsHash.helper";
import { containsSpecialChars } from "@/helpers/containsSpecialChars.helper";
import cron from "node-cron";
import { xlmxService } from "@/services/XLMX.service";
import cronTaskTrackerService from "@/services/CronTaskTrackerService";

enum TRANSACTION_COMMANDS {
  CHOOSE_TAG = "CHOOSE_TAG",
  REMOVE_TAG = "REMOVE_TAG",
}

export class ExpenseTransactionScene extends Scenario {
  scene: Scenes.BaseScene<Context<Update>> = new Scenes.BaseScene(
    SCENES_NAMES.EXPENSES_SCENE
  );

  constructor() {
    super();
  }

  handle() {
    this.scene.enter(async (ctx) => {
      const timezone = (ctx as any).session.timezone || "UTC";

      const text = "Choose primary tag as category";

      ctx.reply(
        text,
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          Markup.button.callback(
            "Choose primary tag",
            TRANSACTION_COMMANDS.CHOOSE_TAG
          ),
        ])
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, (ctx) => {
      (ctx as any).scene.leave();
      ctx.editMessageText("You've come back");
    });

    this.scene.action(TRANSACTION_COMMANDS.CHOOSE_TAG, (ctx) => {
      const tags = (ctx as any).session.tags || [];

      if (!tags.length) {
        ctx.reply(
          "There is no tags",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      const buttons = tags.map((tag: any) =>
        Markup.button.callback(tag, `choose_${tag}`)
      );
      ctx.reply("Select one of the tags:", Markup.inlineKeyboard(buttons));
    });

    this.scene.action(/choose_(.+)/, (ctx) => {
      const tagToChoose = ctx.match[1];

      (ctx as any).scene.state.choosenTag = tagToChoose;

      ctx.reply(`Tag "${tagToChoose}" was choosen.`);
      ctx.reply(
        `Please input your amount:`,
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
        ])
      );
    });

    this.scene.on("text", (ctx) => {
      const messageText = ctx.message?.text;
      const textAsNumber = Number(messageText.trim().toLowerCase());

      if (containsSpecialChars(messageText) || containsSlash(messageText)) {
        ctx.reply(
          `If you want to change this Scene to another one use button below`,
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      if (!textAsNumber || isNaN(textAsNumber)) {
        ctx.reply(
          "Please, input only numbers",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      const isInvalidNumber = textAsNumber <= 0;

      if (isInvalidNumber) {
        ctx.reply(
          "Value can't be less 0 or be equal 0",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      const session = (ctx as any).session;
      const state = (ctx as any).scene.state;

      if (!("choosenTag" in state)) {
        ctx.reply(
          "Please select tag first",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
            Markup.button.callback(
              "Choose tag first",
              TRANSACTION_COMMANDS.CHOOSE_TAG
            ),
          ])
        );
      }

      const expenses = session.expenses;

      session.expenses = [
        ...(expenses ?? []),
        {
          id: Date.now(),
          amount: textAsNumber,
          tag: state.choosenTag,
          created_date: new Date(),
          currency: CURRENCIES.EURO,
        },
      ];

      const totalExpensesToday = this.calculateExpensesToday(
        session.expenses,
        session.timezone
      );

      ctx.replyWithMarkdown(
        `Noted. 

        You've spent: *${textAsNumber} ${CURRENCIES.EURO}*;

        Todays Total: *${totalExpensesToday} ${CURRENCIES.EURO}*;

        Your primary tag as category: *${state.choosenTag}*;

        Your timezone is: *${session.timezone}*;
        `,
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          Markup.button.callback(
            "Choose another primary tag",
            TRANSACTION_COMMANDS.CHOOSE_TAG
          ),
        ])
      );

      if (session?.isMonthlyFileReport) {
        return;
      }

      session.isMonthlyFileReport = true;

      const cronTask = cron.schedule(
        "0 0 1 * *",
        () => {
          const data = session?.expenses;

          if (!data || !data?.length) {
            return ctx.reply("There is no data");
          }

          const { filename, readStream } =
            xlmxService.getReadStreamByData(data);

          ctx
            .replyWithDocument({
              source: readStream,
              filename,
            })
            .then(() => {
              session.expenses = [];
              session.isMonthlyFileReport = false;

              const cronTaskBySessionId = cronTaskTrackerService.get(
                session.id
              );

              cronTaskBySessionId?.stop();

              cronTaskTrackerService.delete(session.id);
            })
            .then(() => {
              ctx.replyWithMarkdown(
                `The expense session has been recorded and saved in the XLSX file ${filename} for the monthly report. The session has been reset in the application.`
              );
            })
            .catch((error) => {
              console.error("Error sending document:", error);
            });
        },
        {
          scheduled: true,
          timezone: session.timezone,
        }
      );

      cronTaskTrackerService.set(session.id, cronTask);
    });
  }
  calculateExpensesLastHour(expenses: IAmountData[]) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastHourExpenses = expenses.filter(
      (expense) => new Date(expense.created_date) > oneHourAgo
    );
    return lastHourExpenses.reduce(
      (total, expense) => total + expense.amount,
      0
    );
  }

  calculateExpensesToday(expenses: IAmountData[], timezone: string) {
    const startOfDay = moment().tz(timezone).startOf("day");

    const todayExpenses = expenses.filter((expense) =>
      moment(expense.created_date).tz(timezone).isSameOrAfter(startOfDay)
    );

    return todayExpenses.reduce((total, expense) => total + expense.amount, 0);
  }
}
