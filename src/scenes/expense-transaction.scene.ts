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
} from "@/types/app-context.interface";
import { containsSlash } from "@/helpers/containsHash.helper";
import * as emoji from "node-emoji";
import { formatCents, toCents } from "@/helpers/money.helper";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService, computeExpenseLimitResult } from "@/modules/transaction";
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
  amountCents: number;
  category?: string;
}

interface IExpenseSceneState {
  pendingAmountCents?: number;
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
    state.pendingAmountCents = undefined;
    state.pendingAmountLabel = undefined;
    state.pendingCategories = undefined;
    state.awaitingCustomCategory = false;
  }

  private formatAmountForPrompt(amountCents: number) {
    const fixed = formatCents(amountCents);
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

    const amountCents = toCents(`${match[1]}${match[2] ?? ""}`);

    if (amountCents == null || amountCents <= 0) {
      return null;
    }

    const category = sanitizeCategory(match[3]);

    return {
      amountCents,
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
    amountCents: number,
  ) {
    const state = this.getState(ctx);
    const recentCategories = await this.getRecentCategories(key);
    const categories = this.getCategoriesForPicker(recentCategories);
    const amountLabel = this.formatAmountForPrompt(amountCents);

    state.pendingAmountCents = amountCents;
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
    amountCents: number,
    category: string,
  ) {
    const key = getSessionKeyFromContext(ctx);

    if (!key) {
      await ctx.reply("Cannot resolve session key for current chat");
      return;
    }

    const transaction: IAmountData = {
      id: Date.now(),
      amount: amountCents,
      category,
      created_date: new Date(),
      currency: CURRENCIES.EURO,
    };

    await transactionService.addExpense(key, transaction);

    const [expenses, income] = await Promise.all([
      transactionService.getExpensesByKey(key),
      transactionService.getIncomeByKey(key),
    ]);

    const { totalExpensesToday, dailyLimit, isLimitExceeded, overspentAmount, snapshot, sessionUpdates } =
      computeExpenseLimitResult({
        expenses,
        income,
        monthlySavingsGoal: ctx.session.monthlySavingsGoal,
        savingsGoalCarryoverDate: ctx.session.savingsGoalCarryoverDate,
        savingsGoalCarryoverAmount: ctx.session.savingsGoalCarryoverAmount,
        savingsGoalExtraAmount: ctx.session.savingsGoalExtraAmount,
      });

    if (sessionUpdates.savingsGoalExtraAmount !== undefined) {
      ctx.session.savingsGoalExtraAmount = sessionUpdates.savingsGoalExtraAmount;
    }
    if (sessionUpdates.savingsGoalCarryoverDate !== undefined) {
      ctx.session.savingsGoalCarryoverDate = sessionUpdates.savingsGoalCarryoverDate;
    }
    if (sessionUpdates.savingsGoalCarryoverAmount !== undefined) {
      ctx.session.savingsGoalCarryoverAmount = sessionUpdates.savingsGoalCarryoverAmount;
    }

    const state = this.getState(ctx);
    this.resetState(state);

    const isLimitConfigured = dailyLimit != null;

    const limitStatusLine = !isLimitConfigured
      ? `Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal> to configure today's limit.`
      : isLimitExceeded
        ? `${emoji.get("warning")} ${formatCents(overspentAmount)} ${CURRENCIES.EURO} over today's limit`
        : `Today: ${formatCents(totalExpensesToday)} / ${formatCents(dailyLimit)} ${CURRENCIES.EURO}`;

    const monthProgressLine =
      snapshot != null
        ? `Available this month: ${formatCents(snapshot.displayRemainingExpenseBudget)} ${CURRENCIES.EURO}`
        : `Available this month: Set /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal>.`;
    const incomeExceededLine =
      snapshot != null && snapshot.isIncomeExceeded
        ? `\n${emoji.get("warning")} You've exceeded your income`
        : "";

    const categoryLabel = category.startsWith("#") ? category : `#${category}`;

    const categoryToStatusSeparator =
      isLimitConfigured && !isLimitExceeded ? "\n\n" : "\n";
    const statusToMonthSeparator =
      snapshot != null && snapshot.isIncomeExceeded ? "\n\n" : "\n";

    await ctx.reply(
      `-${formatCents(amountCents)} ${CURRENCIES.EURO} — ${categoryLabel}${categoryToStatusSeparator}${limitStatusLine}${statusToMonthSeparator}${monthProgressLine}${incomeExceededLine}`,
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

      if (state.pendingAmountCents == null) {
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

        if (state.pendingAmountCents == null || !state.pendingCategories?.length) {
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

          await this.showCategoryPicker(ctx, key, state.pendingAmountCents);
          return;
        }

        await this.saveExpenseTransaction(ctx, state.pendingAmountCents, category);
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

      if (state.awaitingCustomCategory && state.pendingAmountCents != null) {
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
          state.pendingAmountCents,
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
          parsedInput.amountCents,
          parsedInput.category,
        );
        return;
      }

      await this.showCategoryPicker(ctx, key, parsedInput.amountCents);
    });
  }
}
