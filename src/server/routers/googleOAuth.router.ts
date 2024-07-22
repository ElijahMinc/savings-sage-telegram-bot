//@ts-ignore
import { Router } from "express";
import GoogleOAuthController from "../controllers/GoogleOAuthController";

const googleOAuthRouter = Router();

googleOAuthRouter.get(
  GoogleOAuthController.googleOAuthCbUrl,
  GoogleOAuthController.getOAuth2Callback
);

export { googleOAuthRouter };
