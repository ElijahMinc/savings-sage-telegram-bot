import crypto from "crypto";

export enum COMMAND_NAMES {
  START = "start",
  TAGS = "manage_tags",
  CHANGE_MODE = "change_mode",
  TRANSACTION = "transaction",
  DOWNLOAD_ANALYTICS = "download_analytics",
}

export enum SCENES_NAMES {
  EXPENSES_SCENE = "EXPENSES_SCENE",
  INCOME_SCENE = "INCOME_SCENE",
  TAG_SCENE = "TAG_SCENE",

  EXIT_FROM_SCENE = "EXIT",
}

export const commands = Object.freeze([
  {
    command: COMMAND_NAMES.START,
    description: "Start command",
  },
  {
    command: COMMAND_NAMES.TAGS,
    description: "Manage tags command",
  },
  {
    command: COMMAND_NAMES.CHANGE_MODE,
    description: "Change expense mode or income command",
  },
  {
    command: COMMAND_NAMES.TRANSACTION,
    description: "Make a transaction",
  },
  {
    command: COMMAND_NAMES.DOWNLOAD_ANALYTICS,
    description: "Download transaction data",
  },
]);

export const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export const DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS = 30;

export const regexAllSymbols = new RegExp(
  /[\/+\-!@#$%^&*()_+=[\]{};:'",.<>?\\|`~]/
);

export const regexStrictNumber = new RegExp(/^\d+(\.\d+)?$/);

export const regexSlash = new RegExp(/\//);

export const transactionDefaultFormatDate = "DD-MM-YYYY";

export const iv = crypto.randomBytes(16); // generation initial vector

export const dailyReportCRONMask = "0 0 * * *";
