import express, { Express, Response } from "express";
import configRouter from "./routers";
import errorHandler from "./middleware/error.middleware";

export class ExpressServer {
  server: Express = express();

  constructor(bot: any) {
    this.middlewares(bot);
  }

  init() {
    this.server.listen(3001, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${3001}`);
    });
  }

  private middlewares(bot: any) {
    this.server.use(express.json());
    //routers
    this.server.use(
      "/api",
      (req, res: Response & Partial<{ bot: any }>, next) => {
        res.bot = bot;

        next();
      },
      configRouter
    );
    //error all handling
    this.server.use(errorHandler);
  }
}
