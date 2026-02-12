import {
  COMMAND_NAMES,
  DEFAULT_EXPENSE_CATEGORIES,
  EXIT_BUTTON,
  SCENES_NAMES,
  START_COMMAND_MESSAGE,
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
import * as emoji from "node-emoji";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/services/TransactionService";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import {
  encryptNumber,
  getDecryptedNumber,
} from "@/helpers/encryptedNumber.helper";
import {
  getTopCategoriesByUsage,
  mergeCategories,
  sanitizeCategory,
} from "@/helpers/categoryOptions.helper";

enum TRANSACTION_COMMANDS {
  CUSTOM_CATEGORY = "EXPENSE_CUSTOM_CATEGORY",
  CHANGE_TRANSACTION = "EXPENSE_CHANGE_TRANSACTION",
}

interface IExpenseInput {
  amount: number;
  category?: string;
}

interface IExpenseSceneState {
  pendingAmount?: number;
  pendingAmountLabel?: string;
  pendingCategories?: string[];
  awaitingCustomCategory?: boolean;
}

const EXPENSE_INPUT_RULES_MESSAGE = `Enter the expense amount in formats:
450
450.50
450,50
1 200`;

const CATEGORY_CALLBACK_PREFIX = "choose_expense_category_";
const MAX_RECENT_CATEGORIES = 5;

export class ExpenseTransactionScene extends Scenario {
  scene: Scenes.BaseScene<SceneContexts<"ExpenseTransactionScene">> =
    new Scenes.BaseScene(SCENES_NAMES.EXPENSES_SCENE);

  constructor() {
    super();
  }

  private getState(ctx: SceneContexts<"ExpenseTransactionScene">) {
    return ctx.scene.state as IExpenseSceneState;
  }

  private resetState(state: IExpenseSceneState) {
    state.pendingAmount = undefined;
    state.pendingAmountLabel = undefined;
    state.pendingCategories = undefined;
    state.awaitingCustomCategory = false;
  }

  private formatAmountForPrompt(amount: number) {
    const fixed = getFixedAmount(amount);
    const [integerPart, decimalPart] = fixed.split(".");
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    if (decimalPart === "00") {
      return groupedInteger;
    }

    return `${groupedInteger},${decimalPart}`;
  }

  private parseExpenseInput(text: string): IExpenseInput | null {
    const trimmed = text.trim();

    if (!trimmed.length) {
      return null;
    }

    const match = trimmed.match(
      /^(\d{1,3}(?:[ \u00A0]\d{3})*|\d+)([.,]\d{1,2})?(?:\s+(.+))?$/,
    );

    if (!match) {
      return null;
    }

    const integerPart = match[1].replace(/[ \u00A0]/g, "");
    const decimalPart = match[2] ? `.${match[2].slice(1)}` : "";
    const amount = Number(`${integerPart}${decimalPart}`);

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const category = sanitizeCategory(match[3]);

    return {
      amount: Number(amount.toFixed(2)),
      ...(category ? { category } : {}),
    };
  }

  private async promptForAmount(
    ctx: SceneContexts<"ExpenseTransactionScene">,
    message = "Enter the expense amount (for example: 450, 450.50, 450,50).",
  ) {
    await ctx.reply(message, Markup.inlineKeyboard([EXIT_BUTTON]));
  }

  private async getRecentCategories(key: string) {
    const expenses = await transactionService.getExpensesByKey(key);
    return getTopCategoriesByUsage(expenses, MAX_RECENT_CATEGORIES);
  }

  private getCategoriesForPicker(recentCategories: string[]) {
    return mergeCategories(recentCategories, DEFAULT_EXPENSE_CATEGORIES);
  }

  private buildCategoryKeyboard(categories: string[]) {
    const rows = [];

    for (let i = 0; i < categories.length; i += 3) {
      const row = categories.slice(i, i + 3).map((category, idx) => {
        const index = i + idx;
        return Markup.button.callback(
          category,
          `${CATEGORY_CALLBACK_PREFIX}${index}`,
        );
      });

      rows.push(row);
    }

    rows.push([
      Markup.button.callback("Custom...", TRANSACTION_COMMANDS.CUSTOM_CATEGORY),
    ]);
    rows.push([Markup.button.callback("Cancel", SCENES_NAMES.EXIT_FROM_SCENE)]);

    return Markup.inlineKeyboard(rows);
  }

  private async showCategoryPicker(
    ctx: SceneContexts<"ExpenseTransactionScene">,
    key: string,
    amount: number,
  ) {
    const state = this.getState(ctx);
    const recentCategories = await this.getRecentCategories(key);
    const categories = this.getCategoriesForPicker(recentCategories);
    const amountLabel = this.formatAmountForPrompt(amount);

    state.pendingAmount = amount;
    state.pendingAmountLabel = amountLabel;
    state.pendingCategories = categories;
    state.awaitingCustomCategory = false;

    await ctx.reply(
      `Expense ${amountLabel} ${CURRENCIES.EURO}. Choose a category:`,
      this.buildCategoryKeyboard(categories),
    );
  }

  private async saveExpenseTransaction(
    ctx: SceneContexts<"ExpenseTransactionScene">,
    amount: number,
    category: string,
  ) {
    const key = getSessionKeyFromContext(ctx);

    if (!key) {
      await ctx.reply("Cannot resolve session key for current chat");
      return;
    }

    const transaction: IAmountData = {
      id: Date.now(),
      amount: encrypt(getFixedAmount(amount)),
      category,
      created_date: new Date(),
      currency: CURRENCIES.EURO,
    };

    await transactionService.addExpense(key, transaction);
    const [expenses, income] = await Promise.all([
      transactionService.getExpensesByKey(key),
      transactionService.getIncomeByKey(key),
    ]);
    const totalExpensesToday = this.calculateExpensesToday(expenses);
    const monthlySavingsGoal = getDecryptedNumber(
      ctx.session.monthlySavingsGoal,
    );
    const monthlyIncome = this.calculateCurrentMonthIncomeTotal(income);
    const monthlyExpenses = this.calculateCurrentMonthExpenseTotal(expenses);
    const now = moment();
    const baseSnapshot =
      monthlySavingsGoal != null
        ? getLimitSnapshot({
            monthlyIncome,
            monthlyExpenses,
            monthlySavingsGoal,
            daysInMonth: now.daysInMonth(),
            currentDayOfMonth: now.date(),
          })
        : null;
    const baseDailyLimit =
      baseSnapshot != null ? baseSnapshot.autoDailyLimit : null;

    let savingsGoalExtraDelta = 0;

    if (monthlySavingsGoal != null && baseDailyLimit != null) {
      const dayKey = now.format("YYYY-MM-DD");
      const previousAppliedToday =
        ctx.session.savingsGoalCarryoverDate === dayKey
          ? (getDecryptedNumber(ctx.session.savingsGoalCarryoverAmount) ?? 0)
          : 0;
      const currentSavedToday = Math.max(
        baseDailyLimit - totalExpensesToday,
        0,
      );

      savingsGoalExtraDelta = Number(
        (currentSavedToday - previousAppliedToday).toFixed(2),
      );

      if (savingsGoalExtraDelta !== 0) {
        const currentSavingsGoalExtraAmount =
          getDecryptedNumber(ctx.session.savingsGoalExtraAmount) ?? 0;
        const adjustedSavingsGoalExtraAmount = Number(
          Math.max(
            currentSavingsGoalExtraAmount + savingsGoalExtraDelta,
            0,
          ).toFixed(2),
        );

        ctx.session.savingsGoalExtraAmount = encryptNumber(
          adjustedSavingsGoalExtraAmount,
        );
      }

      ctx.session.savingsGoalCarryoverDate = dayKey;
      ctx.session.savingsGoalCarryoverAmount = encryptNumber(currentSavedToday);
    }

    const snapshot =
      monthlySavingsGoal != null
        ? getLimitSnapshot({
            monthlyIncome,
            monthlyExpenses,
            monthlySavingsGoal,
            daysInMonth: now.daysInMonth(),
            currentDayOfMonth: now.date(),
          })
        : null;
    const dailyLimit = snapshot != null ? snapshot.autoDailyLimit : null;
    const isLimitConfigured = dailyLimit != null;
    const isLimitExceeded =
      isLimitConfigured && totalExpensesToday > dailyLimit;
    const overspentAmount = isLimitExceeded
      ? totalExpensesToday - dailyLimit
      : 0;
    const state = this.getState(ctx);

    this.resetState(state);

    const limitStatusLine = !isLimitConfigured
      ? `Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal> to configure today's limit.`
      : isLimitExceeded
        ? `${emoji.get("warning")} ${getFixedAmount(overspentAmount)} ${CURRENCIES.EURO} over today's limit`
        : `Today: ${getFixedAmount(totalExpensesToday)} / ${getFixedAmount(dailyLimit)} ${CURRENCIES.EURO}`;

    const monthProgressLine =
      snapshot != null
        ? `Available this month: ${getFixedAmount(snapshot.remainingExpenseBudget)} ${CURRENCIES.EURO}`
        : `Available this month: Set /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal>.`;

    const categoryLabel = category.startsWith("#") ? category : `#${category}`;

    const separatorLine = isLimitConfigured && !isLimitExceeded ? "\n\n" : "\n";

    await ctx.reply(
      `-${getFixedAmount(amount)} ${CURRENCIES.EURO} — ${categoryLabel}${separatorLine}${limitStatusLine}
${monthProgressLine}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Delete",
            `delete_transaction_${transaction.id}`,
          ),
        ],
        [
          Markup.button.callback(
            "Change transaction",
            TRANSACTION_COMMANDS.CHANGE_TRANSACTION,
          ),
        ],
        [EXIT_BUTTON],
      ]),
    );
  }

  handle() {
    this.scene.enter(async (ctx) => {
      const state = this.getState(ctx);
      this.resetState(state);

      await this.promptForAmount(ctx);
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, async (ctx) => {
      await ctx.scene.leave();
      await ctx.reply(START_COMMAND_MESSAGE);
    });

    this.scene.action(TRANSACTION_COMMANDS.CHANGE_TRANSACTION, async (ctx) => {
      await ctx.answerCbQuery();

      const state = this.getState(ctx);
      this.resetState(state);

      await this.promptForAmount(ctx, "Enter a new expense amount.");
    });

    this.scene.action(TRANSACTION_COMMANDS.CUSTOM_CATEGORY, async (ctx) => {
      await ctx.answerCbQuery();

      const state = this.getState(ctx);

      if (state.pendingAmount == null) {
        await this.promptForAmount(ctx, "Enter the expense amount first.");
        return;
      }

      state.awaitingCustomCategory = true;

      await ctx.reply(
        "Type a custom category for this expense.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Cancel", SCENES_NAMES.EXIT_FROM_SCENE)],
        ]),
      );
    });

    this.scene.action(
      new RegExp(`^${CATEGORY_CALLBACK_PREFIX}(\\d+)$`),
      async (ctx) => {
        await ctx.answerCbQuery();

        const state = this.getState(ctx);

        if (state.pendingAmount == null || !state.pendingCategories?.length) {
          await this.promptForAmount(ctx, "Enter the expense amount first.");
          return;
        }

        const categoryIndex = Number(ctx.match[1]);
        const category = state.pendingCategories[categoryIndex];

        if (!category) {
          const key = getSessionKeyFromContext(ctx);

          if (!key) {
            await ctx.reply("Cannot resolve session key for current chat");
            return;
          }

          await this.showCategoryPicker(ctx, key, state.pendingAmount);
          return;
        }

        await this.saveExpenseTransaction(ctx, state.pendingAmount, category);
      },
    );

    this.scene.action(/delete_transaction_(.+)/, async (ctx) => {
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

      const deleted = await transactionService.deleteExpenseById(
        key,
        transactionIdToDelete,
      );

      if (!deleted) {
        await ctx.reply(
          `${emoji.get("exclamation")} Transaction ${transactionIdToDelete} was not found.`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Change transaction",
                TRANSACTION_COMMANDS.CHANGE_TRANSACTION,
              ),
            ],
            [EXIT_BUTTON],
          ]),
        );
        return;
      }

      await ctx.reply(
        `${emoji.get("white_check_mark")} Transaction ${transactionIdToDelete} was deleted.`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "Change transaction",
              TRANSACTION_COMMANDS.CHANGE_TRANSACTION,
            ),
          ],
          [EXIT_BUTTON],
        ]),
      );
    });

    this.scene.on("text", async (ctx) => {
      const messageText = ctx.message?.text;

      if (!messageText) {
        return;
      }

      if (containsSlash(messageText)) {
        await ctx.reply(
          "You are in expense entry flow. Enter an expense amount or press Exit.",
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const state = this.getState(ctx);

      if (state.awaitingCustomCategory && state.pendingAmount != null) {
        const customCategory = sanitizeCategory(messageText);

        if (!customCategory) {
          await ctx.reply(
            "Category cannot be empty. Enter a category name.",
            Markup.inlineKeyboard([
              [Markup.button.callback("Cancel", SCENES_NAMES.EXIT_FROM_SCENE)],
            ]),
          );
          return;
        }

        await this.saveExpenseTransaction(
          ctx,
          state.pendingAmount,
          customCategory,
        );
        return;
      }

      const parsedInput = this.parseExpenseInput(messageText);

      if (!parsedInput) {
        await ctx.reply(
          EXPENSE_INPUT_RULES_MESSAGE,
          Markup.inlineKeyboard([EXIT_BUTTON]),
        );
        return;
      }

      if (parsedInput.category) {
        await this.saveExpenseTransaction(
          ctx,
          parsedInput.amount,
          parsedInput.category,
        );
        return;
      }

      await this.showCategoryPicker(ctx, key, parsedInput.amount);
    });
  }

  calculateExpensesLastHour(expenses: IAmountData[]) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastHourExpenses = expenses.filter(
      (expense) => new Date(expense.created_date) > oneHourAgo,
    );
    return lastHourExpenses.reduce(
      (total, expense) =>
        total + Number(decrypt(expense.amount as IEncryptedData)),
      0,
    );
  }

  calculateExpensesToday(expenses: IAmountData[]) {
    const today = moment();
    const todayExpenses = expenses.filter((expense) =>
      moment(expense.created_date).isSame(today, "day"),
    );

    return todayExpenses.reduce(
      (total, expense) =>
        total + Number(decrypt(expense.amount as IEncryptedData)),
      0,
    );
  }

  calculateCurrentMonthIncomeTotal(incomeTransactions: IAmountData[]) {
    const now = moment();
    const currentMonthIncome = incomeTransactions.filter((item) =>
      moment(item.created_date).isSame(now, "month"),
    );

    return currentMonthIncome.reduce(
      (total, item) => total + Number(decrypt(item.amount as IEncryptedData)),
      0,
    );
  }

  calculateCurrentMonthExpenseTotal(expenses: IAmountData[]) {
    const now = moment();
    const currentMonthExpenses = expenses.filter((item) =>
      moment(item.created_date).isSame(now, "month"),
    );

    return currentMonthExpenses.reduce(
      (total, item) => total + Number(decrypt(item.amount as IEncryptedData)),
      0,
    );
  }
}

