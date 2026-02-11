import { SCENES_NAMES, START_COMMAND_MESSAGE } from "@/constants";
import {
  IAmountData,
  ITransactionRecord,
  SceneContexts,
  TransactionType,
} from "@/context/context.interface";
import { decrypt } from "@/helpers/decrypt";
import { encrypt, IEncryptedData } from "@/helpers/encrypt";
import {
  getTransactionCategory,
  sanitizeCategory,
} from "@/helpers/categoryOptions.helper";
import { containsSlash } from "@/helpers/containsHash.helper";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import { Scenario } from "@/scenes/scene.class";
import { transactionService } from "@/services/TransactionService";
import moment from "moment";
import { Markup, Scenes } from "telegraf";

const ITEMS_PER_PAGE = 5;
const ACTION_PAGE_PREV = "transactions_prev_page";
const ACTION_PAGE_NEXT = "transactions_next_page";
const ACTION_CLOSE = "transactions_close";
const ACTION_BACK_TO_LIST = "transactions_back_to_list";
const ACTION_EDIT_AMOUNT = "transactions_edit_amount";
const ACTION_EDIT_CATEGORY = "transactions_edit_category";
const ACTION_EDIT_PREFIX = "transactions_edit_";
const ACTION_DELETE_PREFIX = "transactions_delete_";
const ACTION_DELETE_CONFIRM_PREFIX = "transactions_delete_confirm_";

interface ITransactionsSceneState {
  currentPage?: number;
  panelMessageId?: number;
  targetTransactionId?: number;
  targetTransactionType?: TransactionType;
  editMode?: "amount" | "category";
}

export class TransactionsScene extends Scenario {
  scene: Scenes.BaseScene<SceneContexts<"TransactionsScene">> =
    new Scenes.BaseScene(SCENES_NAMES.TRANSACTIONS_SCENE);

  private getState(ctx: SceneContexts<"TransactionsScene">) {
    return ctx.scene.state as ITransactionsSceneState;
  }

  private resetState(state: ITransactionsSceneState) {
    state.currentPage = 0;
    state.targetTransactionId = undefined;
    state.targetTransactionType = undefined;
    state.editMode = undefined;
  }

  private getNumericAmount(amount: IAmountData["amount"]) {
    if (typeof amount === "number") {
      return amount;
    }

    return Number(decrypt(amount as IEncryptedData));
  }

  private formatTransactionLine(
    item: ITransactionRecord,
    rowIndex: number,
    page: number,
  ) {
    const amount = getFixedAmount(this.getNumericAmount(item.amount));
    const sign = item.type === "income" ? "+" : "-";
    const category = getTransactionCategory(item) ?? "No category";
    const timestamp = moment(item.created_date).format("DD.MM HH:mm");
    const absoluteIndex = page * ITEMS_PER_PAGE + rowIndex + 1;

    return `${absoluteIndex}. ${sign}${amount} EUR | ${category} | ${timestamp}`;
  }

  private parseAmountInput(text: string) {
    const trimmed = text.trim();
    const match = trimmed.match(
      /^(\d{1,3}(?:[ \u00A0]\d{3})*|\d+)([.,]\d{1,2})?$/,
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

    return Number(amount.toFixed(2));
  }

  private async getPageData(key: string, page: number) {
    const safePage = Math.max(0, page);
    const firstAttempt = await transactionService.getTransactionsPageByKey(
      key,
      safePage,
      ITEMS_PER_PAGE,
    );
    const maxPage = Math.max(Math.ceil(firstAttempt.total / ITEMS_PER_PAGE) - 1, 0);
    const resolvedPage = Math.min(safePage, maxPage);

    if (resolvedPage === safePage) {
      return {
        page: resolvedPage,
        total: firstAttempt.total,
        items: firstAttempt.items,
      };
    }

    const secondAttempt = await transactionService.getTransactionsPageByKey(
      key,
      resolvedPage,
      ITEMS_PER_PAGE,
    );

    return {
      page: resolvedPage,
      total: secondAttempt.total,
      items: secondAttempt.items,
    };
  }

  private buildListKeyboard(
    items: ITransactionRecord[],
    page: number,
    total: number,
  ) {
    const rows = [];
    const hasPrev = page > 0;
    const hasNext = (page + 1) * ITEMS_PER_PAGE < total;

    for (const item of items) {
      rows.push([
        Markup.button.callback(
          "вњЏпёЏ Edit",
          `${ACTION_EDIT_PREFIX}${item.type}_${item.id}`,
        ),
        Markup.button.callback(
          "рџ—‘ Delete",
          `${ACTION_DELETE_PREFIX}${item.type}_${item.id}`,
        ),
      ]);
    }

    rows.push([
      Markup.button.callback("в¬…пёЏ Back", hasPrev ? ACTION_PAGE_PREV : "noop"),
      Markup.button.callback("вћЎпёЏ Next", hasNext ? ACTION_PAGE_NEXT : "noop"),
      Markup.button.callback("вќЊ Close", ACTION_CLOSE),
    ]);

    return Markup.inlineKeyboard(rows);
  }

  private async upsertPanelMessage(
    ctx: SceneContexts<"TransactionsScene">,
    text: string,
    keyboard: ReturnType<typeof Markup.inlineKeyboard>,
  ) {
    const state = this.getState(ctx);
    const chatId = ctx.chat?.id;

    if (!chatId || !state.panelMessageId) {
      const sent = await ctx.reply(text, keyboard);
      state.panelMessageId = sent.message_id;
      return;
    }

    try {
      await ctx.telegram.editMessageText(chatId, state.panelMessageId, undefined, text, {
        reply_markup: keyboard.reply_markup,
      });
    } catch (error) {
      const message = (error as Error)?.message ?? "";

      if (!message.includes("message is not modified")) {
        throw error;
      }
    }
  }

  private buildEditMenuKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("рџ’° Change amount", ACTION_EDIT_AMOUNT)],
      [Markup.button.callback("рџЏ· Change category", ACTION_EDIT_CATEGORY)],
      [Markup.button.callback("в†©пёЏ Back", ACTION_BACK_TO_LIST)],
    ]);
  }

  private buildConfirmDeleteKeyboard(transaction: ITransactionRecord) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "вњ… Yes",
          `${ACTION_DELETE_CONFIRM_PREFIX}${transaction.type}_${transaction.id}`,
        ),
        Markup.button.callback("в†©пёЏ Cancel", ACTION_BACK_TO_LIST),
      ],
    ]);
  }

  private buildEditInputKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("в†©пёЏ Back", ACTION_BACK_TO_LIST)],
    ]);
  }

  private async renderList(
    ctx: SceneContexts<"TransactionsScene">,
    key: string,
    requestedPage: number,
    notice?: string,
  ) {
    const state = this.getState(ctx);
    const { page, total, items } = await this.getPageData(key, requestedPage);
    const totalPages = Math.max(Math.ceil(total / ITEMS_PER_PAGE), 1);

    state.currentPage = page;
    state.targetTransactionId = undefined;
    state.targetTransactionType = undefined;
    state.editMode = undefined;

    const body =
      items.length === 0
        ? "No transactions yet."
        : items
            .map((item, idx) => this.formatTransactionLine(item, idx, page))
            .join("\n");
    const header = `Recent transactions (page ${page + 1}/${totalPages})`;
    const noticeLine = notice ? `${notice}\n\n` : "";

    await this.upsertPanelMessage(
      ctx,
      `${noticeLine}${header}\n\n${body}`,
      this.buildListKeyboard(items, page, total),
    );
  }

  private async renderDeleteConfirmation(
    ctx: SceneContexts<"TransactionsScene">,
    key: string,
    type: TransactionType,
    id: number,
  ) {
    const page = this.getState(ctx).currentPage ?? 0;
    const { items } = await this.getPageData(key, page);
    const transaction = items.find((item) => item.id === id && item.type === type);

    if (!transaction) {
      await this.renderList(ctx, key, page, "Transaction not found.");
      return;
    }

    const state = this.getState(ctx);
    state.targetTransactionId = id;
    state.targetTransactionType = type;
    state.editMode = undefined;

    const amount = getFixedAmount(this.getNumericAmount(transaction.amount));
    const sign = transaction.type === "income" ? "+" : "-";
    const category = getTransactionCategory(transaction) ?? "No category";

    await this.upsertPanelMessage(
      ctx,
      `Delete this transaction?\n\n${sign}${amount} EUR | ${category}`,
      this.buildConfirmDeleteKeyboard(transaction),
    );
  }

  private async renderEditMenu(
    ctx: SceneContexts<"TransactionsScene">,
    key: string,
    type: TransactionType,
    id: number,
  ) {
    const page = this.getState(ctx).currentPage ?? 0;
    const { items } = await this.getPageData(key, page);
    const transaction = items.find((item) => item.id === id && item.type === type);

    if (!transaction) {
      await this.renderList(ctx, key, page, "Transaction not found.");
      return;
    }

    const state = this.getState(ctx);
    state.targetTransactionId = id;
    state.targetTransactionType = type;
    state.editMode = undefined;

    const amount = getFixedAmount(this.getNumericAmount(transaction.amount));
    const sign = transaction.type === "income" ? "+" : "-";
    const category = getTransactionCategory(transaction) ?? "No category";

    await this.upsertPanelMessage(
      ctx,
      `What do you want to change?\n\n${sign}${amount} EUR | ${category}`,
      this.buildEditMenuKeyboard(),
    );
  }

  private async updateTransactionAmount(
    key: string,
    type: TransactionType,
    id: number,
    amount: number,
  ) {
    const encryptedAmount = encrypt(getFixedAmount(amount));

    if (type === "income") {
      return await transactionService.updateIncomeById(key, id, {
        amount: encryptedAmount,
      });
    }

    return await transactionService.updateExpenseById(key, id, {
      amount: encryptedAmount,
    });
  }

  private async updateTransactionCategory(
    key: string,
    type: TransactionType,
    id: number,
    category: string,
  ) {
    if (type === "income") {
      return await transactionService.updateIncomeById(key, id, { category });
    }

    return await transactionService.updateExpenseById(key, id, { category });
  }

  private async deleteTransaction(
    key: string,
    type: TransactionType,
    id: number,
  ) {
    if (type === "income") {
      return await transactionService.deleteIncomeById(key, id);
    }

    return await transactionService.deleteExpenseById(key, id);
  }

  handle() {
    this.scene.enter(async (ctx) => {
      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        await ctx.scene.leave();
        return;
      }

      const state = this.getState(ctx);
      this.resetState(state);

      await this.renderList(ctx, key, 0);
    });

    this.scene.action("noop", async (ctx) => {
      await ctx.answerCbQuery();
    });

    this.scene.action(ACTION_PAGE_PREV, async (ctx) => {
      await ctx.answerCbQuery();

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const state = this.getState(ctx);
      state.panelMessageId = ctx.callbackQuery.message?.message_id;
      const page = Math.max((state.currentPage ?? 0) - 1, 0);
      await this.renderList(ctx, key, page);
    });

    this.scene.action(ACTION_PAGE_NEXT, async (ctx) => {
      await ctx.answerCbQuery();

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const state = this.getState(ctx);
      state.panelMessageId = ctx.callbackQuery.message?.message_id;
      const page = (state.currentPage ?? 0) + 1;
      await this.renderList(ctx, key, page);
    });

    this.scene.action(ACTION_CLOSE, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.leave();
      await ctx.reply(START_COMMAND_MESSAGE);
    });

    this.scene.action(ACTION_BACK_TO_LIST, async (ctx) => {
      await ctx.answerCbQuery();

      const key = getSessionKeyFromContext(ctx);

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      const state = this.getState(ctx);
      state.panelMessageId = ctx.callbackQuery.message?.message_id;
      await this.renderList(ctx, key, state.currentPage ?? 0);
    });

    this.scene.action(
      new RegExp(`^${ACTION_DELETE_PREFIX}(expense|income)_(\\d+)$`),
      async (ctx) => {
        await ctx.answerCbQuery();

        const key = getSessionKeyFromContext(ctx);

        if (!key) {
          await ctx.reply("Cannot resolve session key for current chat");
          return;
        }

        const type = ctx.match[1] as TransactionType;
        const id = Number(ctx.match[2]);

        if (Number.isNaN(id)) {
          return;
        }

        const state = this.getState(ctx);
        state.panelMessageId = ctx.callbackQuery.message?.message_id;
        await this.renderDeleteConfirmation(ctx, key, type, id);
      },
    );

    this.scene.action(
      new RegExp(`^${ACTION_DELETE_CONFIRM_PREFIX}(expense|income)_(\\d+)$`),
      async (ctx) => {
        await ctx.answerCbQuery();

        const key = getSessionKeyFromContext(ctx);

        if (!key) {
          await ctx.reply("Cannot resolve session key for current chat");
          return;
        }

        const type = ctx.match[1] as TransactionType;
        const id = Number(ctx.match[2]);
        const state = this.getState(ctx);
        state.panelMessageId = ctx.callbackQuery.message?.message_id;

        if (!Number.isNaN(id)) {
          await this.deleteTransaction(key, type, id);
        }

        await this.renderList(
          ctx,
          key,
          state.currentPage ?? 0,
          "Transaction deleted.",
        );
      },
    );

    this.scene.action(
      new RegExp(`^${ACTION_EDIT_PREFIX}(expense|income)_(\\d+)$`),
      async (ctx) => {
        await ctx.answerCbQuery();

        const key = getSessionKeyFromContext(ctx);

        if (!key) {
          await ctx.reply("Cannot resolve session key for current chat");
          return;
        }

        const type = ctx.match[1] as TransactionType;
        const id = Number(ctx.match[2]);

        if (Number.isNaN(id)) {
          return;
        }

        const state = this.getState(ctx);
        state.panelMessageId = ctx.callbackQuery.message?.message_id;
        await this.renderEditMenu(ctx, key, type, id);
      },
    );

    this.scene.action(ACTION_EDIT_AMOUNT, async (ctx) => {
      await ctx.answerCbQuery();

      const state = this.getState(ctx);
      state.panelMessageId = ctx.callbackQuery.message?.message_id;
      state.editMode = "amount";

      await this.upsertPanelMessage(
        ctx,
        "Enter new amount (for example: 450, 450.50, 450,50).",
        this.buildEditInputKeyboard(),
      );
    });

    this.scene.action(ACTION_EDIT_CATEGORY, async (ctx) => {
      await ctx.answerCbQuery();

      const state = this.getState(ctx);
      state.panelMessageId = ctx.callbackQuery.message?.message_id;
      state.editMode = "category";

      await this.upsertPanelMessage(
        ctx,
        "Enter new category.",
        this.buildEditInputKeyboard(),
      );
    });

    this.scene.on("text", async (ctx) => {
      const key = getSessionKeyFromContext(ctx);
      const messageText = ctx.message.text;

      if (!key) {
        await ctx.reply("Cannot resolve session key for current chat");
        return;
      }

      if (containsSlash(messageText)) {
        return;
      }

      const state = this.getState(ctx);

      if (
        !state.editMode ||
        state.targetTransactionId == null ||
        !state.targetTransactionType
      ) {
        return;
      }

      if (state.editMode === "amount") {
        const parsedAmount = this.parseAmountInput(messageText);

        if (parsedAmount == null) {
          await this.upsertPanelMessage(
            ctx,
            "Invalid amount. Enter number (for example: 450, 450.50, 450,50).",
            this.buildEditInputKeyboard(),
          );
          return;
        }

        const updated = await this.updateTransactionAmount(
          key,
          state.targetTransactionType,
          state.targetTransactionId,
          parsedAmount,
        );

        await this.renderList(
          ctx,
          key,
          state.currentPage ?? 0,
          updated ? "Amount updated." : "Transaction not found.",
        );
        return;
      }

      const category = sanitizeCategory(messageText);

      if (!category) {
        await this.upsertPanelMessage(
          ctx,
          "Category cannot be empty. Enter category text.",
          this.buildEditInputKeyboard(),
        );
        return;
      }

      const updated = await this.updateTransactionCategory(
        key,
        state.targetTransactionType,
        state.targetTransactionId,
        category,
      );

      await this.renderList(
        ctx,
        key,
        state.currentPage ?? 0,
        updated ? "Category updated." : "Transaction not found.",
      );
    });
  }
}


