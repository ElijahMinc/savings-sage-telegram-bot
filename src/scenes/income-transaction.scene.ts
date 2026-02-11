import {
  EXIT_BUTTON,
  SCENES_NAMES,
  START_COMMAND_MESSAGE,
  TRANSACTION_RULES_MESSAGE,
} from "@/constants";
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
import { encrypt, IEncryptedData } from "@/helpers/encrypt";
import { decrypt } from "@/helpers/decrypt";
import { containsStrictNumber } from "@/helpers/containsStrictNumber.helper";
import * as emoji from "node-emoji";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/services/TransactionService";

enum TRANSACTION_COMMANDS {
  CHOOSE_CATEGORY = "CHOOSE_CATEGORY",
  DELETE_TRANSACTION = "DELETE_TRANSACTION",
}

interface IIncomeSceneState {
  chosenCategory?: string;
}

const INCOME_CATEGORIES = ["Salary", "Freelance", "Bonus", "Gift", "Other"];
const INCOME_CATEGORY_CALLBACK_PREFIX = "choose_income_category_";

export class IncomeTransactionScene extends Scenario {
  scene: Scenes.BaseScene<SceneContexts<"IncomeTransactionScene">> =
    new Scenes.BaseScene(SCENES_NAMES.INCOME_SCENE);

  constructor() {
    super();
  }

  private buildCategoryKeyboard() {
    const rows = [];

    for (let i = 0; i < INCOME_CATEGORIES.length; i += 2) {
      const row = INCOME_CATEGORIES.slice(i, i + 2).map((category, idx) => {
        const index = i + idx;
        return Markup.button.callback(
          category,
          `${INCOME_CATEGORY_CALLBACK_PREFIX}${index}`,
        );
      });
      rows.push(row);
    }

    rows.push([EXIT_BUTTON]);

    return Markup.inlineKeyboard(rows);
  }

  handle() {
    this.scene.enter(async (ctx) => {
      const state = ctx.scene.state as IIncomeSceneState;
      state.chosenCategory = undefined;
      const text = `Choose income category ${emoji.get("label")}`;

      await ctx.reply(
        text,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Choose category ${emoji.get("label")}`,
              TRANSACTION_COMMANDS.CHOOSE_CATEGORY,
            ),
          ],
          [EXIT_BUTTON],
        ]),
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, async (ctx) => {
      await ctx.scene.leave();
      await ctx.reply(START_COMMAND_MESSAGE);
    });

    this.scene.action(TRANSACTION_COMMANDS.CHOOSE_CATEGORY, async (ctx) => {
      await ctx.reply("Select one of the categories:", this.buildCategoryKeyboard());
    });

    this.scene.action(
      new RegExp(`^${INCOME_CATEGORY_CALLBACK_PREFIX}(\\d+)$`),
      async (ctx) => {
        const categoryIndex = Number(ctx.match[1]);
        const category = INCOME_CATEGORIES[categoryIndex];

        if (!category) {
          await ctx.reply(
            "Category not found. Please choose one from the list.",
            this.buildCategoryKeyboard(),
          );
          return;
        }

        const state = ctx.scene.state as IIncomeSceneState;
        state.chosenCategory = category;

        await ctx.reply(
          `${emoji.get(
            "white_check_mark",
          )} Income category ${category} has been selected.

${emoji.get("small_red_triangle_down")} Enter number value;
${emoji.get("small_red_triangle_down")} Press Exit button to leave;`,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
      },
    );

    this.scene.action(/delete_income_transaction_(.+)/, async (ctx) => {
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const transactionIdToDelete = Number(ctx.match[1]);

      if (Number.isNaN(transactionIdToDelete)) {
        await ctx.reply(
          `${emoji.get("exclamation")} Invalid transaction id`,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      const monospaceTransactionId = "`" + transactionIdToDelete + "`";
      const deleted = await transactionService.deleteIncomeById(
        key,
        transactionIdToDelete,
      );

      if (!deleted) {
        await ctx.reply(
          `${emoji.get("exclamation")}Transaction ${transactionIdToDelete} does not exist`,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      await ctx.replyWithMarkdown(
        `${emoji.get(
          "white_check_mark",
        )} The income transaction ${monospaceTransactionId} has been deleted.`,
        Markup.inlineKeyboard([EXIT_BUTTON]),
      );
    });

    this.scene.on("text", async (ctx) => {
      const state = ctx.scene.state as IIncomeSceneState;
      const key = getSessionKeyFromContext(ctx);
      const messageText = ctx.message?.text;

      if (!messageText) {
        return;
      }

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const textAsNumber = Number(messageText.trim().toLowerCase());

      if (containsSlash(messageText)) {
        await ctx.reply(
          "You are in income entry flow. Please enter value as number or leave this scene pressing exit button below",
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      if (!textAsNumber && isNaN(textAsNumber)) {
        await ctx.replyWithMarkdown(
          TRANSACTION_RULES_MESSAGE,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      if (!containsStrictNumber(messageText)) {
        await ctx.replyWithMarkdown(
          TRANSACTION_RULES_MESSAGE,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      if (textAsNumber <= 0) {
        await ctx.replyWithMarkdown(
          TRANSACTION_RULES_MESSAGE,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      if (!state.chosenCategory) {
        await ctx.reply(
          "Please select income category first",
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                `Choose category ${emoji.get("white_check_mark")}`,
                TRANSACTION_COMMANDS.CHOOSE_CATEGORY,
              ),
            ],
            [EXIT_BUTTON],
          ]),
        );

        return;
      }

      const transaction: IAmountData = {
        id: Date.now(),
        amount: encrypt(getFixedAmount(textAsNumber)),
        category: state.chosenCategory,
        created_date: new Date(),
        currency: CURRENCIES.EURO,
      };

      await transactionService.addIncome(key, transaction);
      const income = await transactionService.getIncomeByKey(key);
      const totalIncomeToday = this.calculateIncomeToday(income);
      const monospaceTransactionId = "`" + transaction.id + "`";

      await ctx.replyWithMarkdown(
        `Noted ${emoji.get("white_check_mark")}

${emoji.get("id")} Transaction Id: ${monospaceTransactionId};
${emoji.get("money_with_wings")} You've earned: *${getFixedAmount(
          textAsNumber,
        )} ${CURRENCIES.EURO}*;
${emoji.get("money_with_wings")} Todays Income Total: *${getFixedAmount(
          totalIncomeToday,
        )} ${CURRENCIES.EURO}*;
${emoji.get("label")} Category: *${state.chosenCategory}*`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Choose another category ${emoji.get("label")}`,
              TRANSACTION_COMMANDS.CHOOSE_CATEGORY,
            ),
          ],
          [
            Markup.button.callback(
              `Delete this income transaction ${emoji.get("wastebasket")}`,
              `delete_income_transaction_${transaction.id}`,
            ),
          ],
          [EXIT_BUTTON],
        ]),
      );
    });
  }

  calculateIncomeToday(incomeTransactions: IAmountData[]) {
    const today = moment();
    const todayIncome = incomeTransactions.filter((item) =>
      moment(item.created_date).isSame(today, "day"),
    );

    return todayIncome.reduce(
      (total, item) => total + Number(decrypt(item.amount as IEncryptedData)),
      0,
    );
  }
}

