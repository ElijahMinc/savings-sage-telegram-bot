import { Markup, Telegraf } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import {
  COMMAND_NAMES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  START_COMMAND_MESSAGE,
} from "@/constants";
import { containsSlash } from "@/helpers/containsHash.helper";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { transactionService } from "@/services/TransactionService";
import {
  CURRENCIES,
  IAmountData,
  TransactionType,
} from "@/context/context.interface";
import { encrypt, IEncryptedData } from "@/helpers/encrypt";
import { decrypt } from "@/helpers/decrypt";
import * as emoji from "node-emoji";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import {
  getTopCategoriesByUsage,
  mergeCategories,
  sanitizeCategory,
} from "@/helpers/categoryOptions.helper";
import moment from "moment";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import {
  encryptNumber,
  getDecryptedNumber,
} from "@/helpers/encryptedNumber.helper";

interface IQuickTransactionInput {
  amount: number;
  type: TransactionType;
  category?: string;
}

interface IPendingQuickTransaction {
  amount: number;
  type: TransactionType;
  categories: string[];
  awaitingCustomCategory?: boolean;
  promptMessageId?: number;
}

const DEFAULT_EXPENSE_CATEGORY = "Other";
const DEFAULT_INCOME_CATEGORY = "Other";
const MAX_RECENT_CATEGORIES = 5;
const QUICK_CATEGORY_CALLBACK_PREFIX = "quick_tx_category_";
const QUICK_CATEGORY_OTHER = "quick_tx_other";
const QUICK_CATEGORY_CANCEL = "quick_tx_cancel";
const QUICK_TRANSACTION_RULES_MESSAGE = `Enter quick transaction in one of these formats:
450
450 taxi
+50000
+50000 salary`;

export class StartCommand extends Command {
  private pendingQuickTransactions = new Map<
    string,
    IPendingQuickTransaction
  >();

  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  private parseQuickTransactionInput(
    text: string,
  ): IQuickTransactionInput | null {
    const trimmed = text.trim();

    if (!trimmed.length) {
      return null;
    }

    const match = trimmed.match(
      /^([+]?)(\d{1,3}(?:[ \u00A0]\d{3})*|\d+)([.,]\d{1,2})?(?:\s+(.+))?$/,
    );

    if (!match) {
      return null;
    }

    const sign = match[1];
    const integerPart = match[2].replace(/[ \u00A0]/g, "");
    const decimalPart = match[3] ? `.${match[3].slice(1)}` : "";
    const amount = Number(`${integerPart}${decimalPart}`);

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const category = sanitizeCategory(match[4]);
    const type: TransactionType = sign === "+" ? "income" : "expense";

    return {
      amount: Number(amount.toFixed(2)),
      type,
      ...(category ? { category } : {}),
    };
  }

  private hasActiveScene(ctx: IBotContext) {
    const sceneContext = (ctx as any).scene;
    return Boolean(sceneContext?.current);
  }

  private getDefaultCategories(type: TransactionType) {
    return type === "income"
      ? DEFAULT_INCOME_CATEGORIES
      : DEFAULT_EXPENSE_CATEGORIES;
  }

  private buildCategoryPickerKeyboard(categories: string[]) {
    const rows = [];

    for (let i = 0; i < categories.length; i += 3) {
      rows.push(
        categories
          .slice(i, i + 3)
          .map((category, idx) =>
            Markup.button.callback(
              category,
              `${QUICK_CATEGORY_CALLBACK_PREFIX}${i + idx}`,
            ),
          ),
      );
    }

    rows.push([Markup.button.callback("Other...", QUICK_CATEGORY_OTHER)]);
    rows.push([Markup.button.callback("Cancel", QUICK_CATEGORY_CANCEL)]);

    return Markup.inlineKeyboard(rows);
  }

  private async getCategoryPickerOptions(key: string, type: TransactionType) {
    const transactions =
      type === "income"
        ? await transactionService.getIncomeByKey(key)
        : await transactionService.getExpensesByKey(key);
    const recentCategories = getTopCategoriesByUsage(
      transactions,
      MAX_RECENT_CATEGORIES,
    );

    return mergeCategories(recentCategories, this.getDefaultCategories(type));
  }

  private async showCategoryPicker(
    ctx: IBotContext,
    key: string,
    input: IQuickTransactionInput,
  ) {
    const categories = await this.getCategoryPickerOptions(key, input.type);
    const transactionTypeLabel = input.type === "income" ? "income" : "expense";
    const amountLabel = getFixedAmount(input.amount);

    const sent = await ctx.reply(
      `Choose category for ${transactionTypeLabel} ${amountLabel} ${CURRENCIES.EURO}:`,
      this.buildCategoryPickerKeyboard(categories),
    );

    this.pendingQuickTransactions.set(key, {
      amount: input.amount,
      type: input.type,
      categories,
      awaitingCustomCategory: false,
      promptMessageId: sent.message_id,
    });
  }

  private async editPendingPickerMessage(
    ctx: IBotContext,
    key: string,
    text: string,
    keyboard?: ReturnType<typeof Markup.inlineKeyboard>,
  ) {
    const pending = this.pendingQuickTransactions.get(key);
    const chatId = ctx.chat?.id;
    const messageId = pending?.promptMessageId;

    if (!chatId || !messageId) {
      if (keyboard) {
        await ctx.reply(text, keyboard);
        return;
      }

      await ctx.reply(text);
      return;
    }

    try {
      await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
        ...(keyboard ? { reply_markup: keyboard.reply_markup } : {}),
      });
    } catch {
      if (keyboard) {
        await ctx.reply(text, keyboard);
        return;
      }

      await ctx.reply(text);
    }
  }

  private getNumericAmount(amount: IAmountData["amount"]): number {
    if (typeof amount === "number") {
      return amount;
    }

    return Number(decrypt(amount as IEncryptedData));
  }

  private calculateExpensesToday(expenses: IAmountData[]) {
    const today = moment();

    return expenses
      .filter((expense) => moment(expense.created_date).isSame(today, "day"))
      .reduce(
        (total, expense) => total + this.getNumericAmount(expense.amount),
        0,
      );
  }

  private calculateCurrentMonthIncomeTotal(incomeTransactions: IAmountData[]) {
    const now = moment();

    return incomeTransactions
      .filter((item) => moment(item.created_date).isSame(now, "month"))
      .reduce((total, item) => total + this.getNumericAmount(item.amount), 0);
  }

  private calculateCurrentMonthExpenseTotal(expenses: IAmountData[]) {
    const now = moment();

    return expenses
      .filter((item) => moment(item.created_date).isSame(now, "month"))
      .reduce((total, item) => total + this.getNumericAmount(item.amount), 0);
  }

  private async persistQuickTransaction(
    ctx: IBotContext,
    input: IQuickTransactionInput,
    categoryOverride?: string,
  ) {
    const key = getSessionKeyFromContext(ctx);

    if (!key) {
      await ctx.reply("Cannot resolve session key for current chat");
      return null;
    }

    const category =
      categoryOverride ??
      input.category ??
      (input.type === "income"
        ? DEFAULT_INCOME_CATEGORY
        : DEFAULT_EXPENSE_CATEGORY);
    const categoryLabel = category.startsWith("#") ? category : `#${category}`;
    const transaction: IAmountData = {
      id: Date.now(),
      amount: encrypt(getFixedAmount(input.amount)),
      category,
      created_date: new Date(),
      currency: CURRENCIES.EURO,
    };

    if (input.type === "income") {
      await transactionService.addIncome(key, transaction);
      return `+${getFixedAmount(input.amount)} ${CURRENCIES.EURO} | ${categoryLabel}`;
    }

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
      const savingsGoalExtraDelta = Number(
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

    const limitStatusLine = !isLimitConfigured
      ? `Use /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal> to configure today's limit.`
      : isLimitExceeded
        ? `${emoji.get("warning")} ${getFixedAmount(overspentAmount)} ${CURRENCIES.EURO} over today's limit`
        : `Today: ${getFixedAmount(totalExpensesToday)} / ${getFixedAmount(dailyLimit)} ${CURRENCIES.EURO}`;

    const monthProgressLine =
      snapshot != null
        ? `Available this month: ${getFixedAmount(snapshot.remainingExpenseBudget)} ${CURRENCIES.EURO}`
        : `Available this month: Set /${COMMAND_NAMES.SAVINGS_GOAL} <monthly-goal>.`;
    const separatorLine = isLimitConfigured && !isLimitExceeded ? "\n\n" : "\n";

    return `-${getFixedAmount(input.amount)} ${CURRENCIES.EURO} — ${categoryLabel}${separatorLine}${limitStatusLine}
${monthProgressLine}`;
  }

  handle(): void {
    this.bot.start(async (ctx) => {
      await ctx.reply(START_COMMAND_MESSAGE);
    });

    this.bot.on("text", async (ctx) => {
      if (this.hasActiveScene(ctx)) {
        return;
      }

      const messageText = ctx.message.text;
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const pending = this.pendingQuickTransactions.get(key);

      if (pending?.awaitingCustomCategory) {
        if (containsSlash(messageText)) {
          this.pendingQuickTransactions.delete(key);
          return;
        }

        const customCategory = sanitizeCategory(messageText);

        if (!customCategory) {
          await this.editPendingPickerMessage(
            ctx,
            key,
            "Category cannot be empty. Type a category.",
            Markup.inlineKeyboard([
              [Markup.button.callback("Cancel", QUICK_CATEGORY_CANCEL)],
            ]),
          );
          return;
        }

        const summary = await this.persistQuickTransaction(
          ctx,
          { amount: pending.amount, type: pending.type },
          customCategory,
        );

        if (summary) {
          await this.editPendingPickerMessage(ctx, key, summary);
        }

        this.pendingQuickTransactions.delete(key);
        return;
      }

      if (containsSlash(messageText)) {
        return;
      }

      const parsedInput = this.parseQuickTransactionInput(messageText);

      if (parsedInput) {
        if (parsedInput.category) {
          const summary = await this.persistQuickTransaction(ctx, parsedInput);

          if (summary) {
            await ctx.reply(summary);
          }

          return;
        }

        this.pendingQuickTransactions.delete(key);
        await this.showCategoryPicker(ctx, key, parsedInput);
        return;
      }

      await ctx.reply(
        `${QUICK_TRANSACTION_RULES_MESSAGE}

Try these commands: /${COMMAND_NAMES.TRANSACTIONS}, /${COMMAND_NAMES.BALANCE}, /${COMMAND_NAMES.SAVINGS_GOAL}, /${COMMAND_NAMES.ANALYTICS}, /${COMMAND_NAMES.REMIND}`,
      );
    });

    this.bot.action(
      new RegExp(`^${QUICK_CATEGORY_CALLBACK_PREFIX}(\\d+)$`),
      async (ctx) => {
        await ctx.answerCbQuery();

        const key = getSessionKeyFromContext(ctx);

        if (!key) {
          await ctx.reply("Cannot resolve session key for current chat");
          return;
        }

        const pending = this.pendingQuickTransactions.get(key);

        if (!pending) {
          return;
        }

        const categoryIndex = Number(ctx.match[1]);
        const category = pending.categories[categoryIndex];

        if (!category) {
          return;
        }

        const summary = await this.persistQuickTransaction(
          ctx,
          { amount: pending.amount, type: pending.type },
          category,
        );

        if (summary) {
          await this.editPendingPickerMessage(ctx, key, summary);
        }

        this.pendingQuickTransactions.delete(key);
      },
    );

    this.bot.action(QUICK_CATEGORY_OTHER, async (ctx) => {
      await ctx.answerCbQuery();

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const pending = this.pendingQuickTransactions.get(key);

      if (!pending) {
        return;
      }

      pending.awaitingCustomCategory = true;
      this.pendingQuickTransactions.set(key, pending);

      await this.editPendingPickerMessage(
        ctx,
        key,
        "Type a category name.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Cancel", QUICK_CATEGORY_CANCEL)],
        ]),
      );
    });

    this.bot.action(QUICK_CATEGORY_CANCEL, async (ctx) => {
      await ctx.answerCbQuery();

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      if (!this.pendingQuickTransactions.has(key)) {
        return;
      }

      await this.editPendingPickerMessage(ctx, key, "Cancelled.");
      this.pendingQuickTransactions.delete(key);
    });
  }
}

