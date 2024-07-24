import { dailyReportCRONMask, SCENES_NAMES } from "@/constants";
import { Markup, Scenes } from "telegraf";
import { Scenario } from "./scene.class";
import {
  CURRENCIES,
  IAmountData,
  SceneContexts,
} from "@/context/context.interface";
import moment from "moment";
import "moment-timezone";
import { containsSlash } from "@/helpers/containsHash.helper";
import { containsSpecialChars } from "@/helpers/containsSpecialChars.helper";
import cron from "node-cron";
import { xlmxService } from "@/services/XLMX.service";
import cronTaskTrackerService from "@/services/CronTaskTrackerService";
import { encrypt, IEncryptedData } from "@/helpers/encrypt";
import { decrypt } from "@/helpers/decrypt";

enum TRANSACTION_COMMANDS {
  CHOOSE_TAG = "CHOOSE_TAG",
  REMOVE_TAG = "REMOVE_TAG",
}

export class ExpenseTransactionScene extends Scenario {
  scene: Scenes.BaseScene<SceneContexts<"ExpenseTransactionScene">> =
    new Scenes.BaseScene(SCENES_NAMES.EXPENSES_SCENE);

  constructor() {
    super();
  }

  handle() {
    this.scene.enter(async (ctx) => {
      const text = "Choose primary tag as category";

      ctx.reply(
        text,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "Choose primary tag",
              TRANSACTION_COMMANDS.CHOOSE_TAG
            ),
          ],
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, (ctx) => {
      (ctx as any).scene.leave();
      ctx.editMessageText("You've left the scene and came back");
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

      const buttons = tags.map((tag: string) =>
        Markup.button.callback(tag, `choose_${tag}`)
      );
      ctx.reply(
        "Select one of the tags:",
        Markup.inlineKeyboard([
          ...buttons,
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      );
    });

    this.scene.action(/choose_(.+)/, (ctx) => {
      const tagToChoose = ctx.match[1];

      (ctx as any).scene.state.choosenTag = tagToChoose;

      ctx.reply(`The tag "${tagToChoose}" has been selected`);
      ctx.reply(
        `Please input your amount:`,
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
        ])
      );
    });

    this.scene.on("text", (ctx) => {
      const session = ctx.session;
      const state = ctx.scene.state;

      const messageText = ctx.message?.text;
      const textAsNumber = Number(messageText.trim().toLowerCase());

      if (containsSpecialChars(messageText) || containsSlash(messageText)) {
        ctx.reply(
          `You are in /transaction scene. 
          
          Please enter value as number or leave this scene pressing exit button below`,
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
          "Number value can't be less 0 or be equal 0",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      if (!("choosenTag" in state)) {
        ctx.reply(
          "Please select tag as category first",
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Choose tag",
                TRANSACTION_COMMANDS.CHOOSE_TAG
              ),
            ],
            [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
          ])
        );

        return;
      }

      const expenses = session.expenses;

      const transaction: IAmountData = {
        id: Date.now(),
        amount: encrypt(textAsNumber.toString()),
        tag: state.choosenTag as string,
        created_date: new Date(),
        currency: CURRENCIES.EURO,
      };

      session.expenses = [...(expenses ?? []), transaction];

      const totalExpensesToday = this.calculateExpensesToday(session.expenses);

      const monospaceTransactionId = "`" + transaction.id + "`";

      ctx.replyWithMarkdown(
        `Noted. 

        Transaction Id: ${monospaceTransactionId};

        You've spent: *${textAsNumber} ${CURRENCIES.EURO}*;

        Todays Total: *${totalExpensesToday} ${CURRENCIES.EURO}*;

        Your primary tag as category: *${state.choosenTag}*;
        `,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "Choose another primary tag",
              TRANSACTION_COMMANDS.CHOOSE_TAG
            ),
          ],
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      );

      if (session?.isDailyFileReport) {
        return;
      }

      session.isDailyFileReport = true;

      const cronTask = cron.schedule(
        dailyReportCRONMask,
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
              session.isDailyFileReport = false;

              const cronTaskBySessionId = cronTaskTrackerService.get(
                session.chatId.toString()
              );

              cronTaskBySessionId?.stop();

              cronTaskTrackerService.delete(session.chatId.toString());
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
          timezone: "UTC",
        }
      );

      cronTaskTrackerService.set(session.chatId.toString(), cronTask);
    });
  }
  calculateExpensesLastHour(expenses: IAmountData[]) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastHourExpenses = expenses.filter(
      (expense) => new Date(expense.created_date) > oneHourAgo
    );
    return lastHourExpenses.reduce(
      (total, expense) =>
        total + Number(decrypt(expense.amount as IEncryptedData)),
      0
    );
  }

  calculateExpensesToday(expenses: IAmountData[]) {
    const startOfDay = moment().startOf("day");

    const todayExpenses = expenses.filter((expense) =>
      moment(expense.created_date).isSameOrAfter(startOfDay)
    );

    return todayExpenses.reduce(
      (total, expense) =>
        total + Number(decrypt(expense.amount as IEncryptedData)),
      0
    );
  }
}
