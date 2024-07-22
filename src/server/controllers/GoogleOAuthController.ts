//@ts-ignore
import { NextFunction, Request, Response } from "express";
import googleOAuthService from "../services/GoogleOAuthService";

export class GoogleOAuthController {
  googleOAuthCbUrl: string = "/google/oauth2callback";

  constructor() {}

  async getOAuth2Callback(
    req: Request,
    res: Response & Partial<{ bot: any }>,
    next: NextFunction
  ) {
    try {
      const { code } = req.query;
      console.log("res", res.bot);
      const { tokens } = await googleOAuthService.getOAuth2Client(
        code as string
      );
      console.log("TOKENS", tokens);

      //! ПЕРЕДЕЛАТЬ!
      res.bot.telegram.sendMessage(
        tokens.telegramChatId,
        `Успешная авторизация!`
      );
      // Здесь вы можете сохранить токены в базе данных или отправить их обратно в бота
      res.send("Авторизация прошла успешно! Можете вернуться в Telegram.");
    } catch (e) {
      console.log("ERROR", e);
      next(e);
    }
  }
}

export default new GoogleOAuthController();
