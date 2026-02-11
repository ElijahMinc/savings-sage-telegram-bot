import { Context } from "telegraf";

export const buildSessionKey = (fromId: number, chatId: number): string => {
  return `${fromId}:${chatId}`;
};

export const getSessionKeyFromContext = (
  ctx: Pick<Context, "from" | "chat">
): string | null => {
  if (!ctx.from || !ctx.chat) {
    return null;
  }

  return buildSessionKey(ctx.from.id, ctx.chat.id);
};
