import Router from "express";
import { googleOAuthRouter } from "./googleOAuth.router";

const configRouter = Router();

configRouter.use(googleOAuthRouter);

export default configRouter;
