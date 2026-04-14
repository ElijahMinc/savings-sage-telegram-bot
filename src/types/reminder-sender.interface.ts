export interface IMessageSender {
  sendMessage(chatId: number, text: string): Promise<void>;
  sendDocument(
    chatId: number,
    document: { source: NodeJS.ReadableStream; filename: string },
    caption?: string,
  ): Promise<void>;
}
