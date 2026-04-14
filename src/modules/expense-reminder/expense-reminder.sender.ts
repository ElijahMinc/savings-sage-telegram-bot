import { IBotContext } from "@/types/app-context.interface";
import { IMessageSender } from "@/types/reminder-sender.interface";
import { Telegraf } from "telegraf";

export class TelegramExpenseReminderSender implements IMessageSender {
  constructor(private bot: Telegraf<IBotContext>) {}

  async sendMessage(chatId: number, text: string) {
    await this.bot.telegram.sendMessage(chatId, text);
  }

  async sendDocument(
    chatId: number,
    document: { source: NodeJS.ReadableStream; filename: string },
    caption?: string,
  ) {
    await this.bot.telegram.sendDocument(chatId, document, {
      caption,
    });
  }
}
