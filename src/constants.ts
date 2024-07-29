import crypto from "crypto";
import * as emoji from "node-emoji";
import { Markup } from "telegraf";

export enum COMMAND_NAMES {
  START = "start",
  TAGS = "tags",
  CHANGE_MODE = "mode",
  TRANSACTION = "transaction",
  DOWNLOAD_ANALYTICS = "analytic",
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
// * * * * * - one minute

export const EXIT_BUTTON = Markup.button.callback(
  `Exit ${emoji.get("door")}`,
  SCENES_NAMES.EXIT_FROM_SCENE
);

export const COME_BACK_MESSAGE = `You've come back at home commands ${emoji.get(
  "house"
)}`;

export const START_COMMAND_MESSAGE = `
${emoji.get("small_red_triangle_down")} Manage your tags using /${
  COMMAND_NAMES.TAGS
} 

${emoji.get("small_red_triangle_down")} Manage expenses or incomes using /${
  COMMAND_NAMES.CHANGE_MODE
}

${emoji.get("small_red_triangle_down")} Manage your transactions using /${
  COMMAND_NAMES.TRANSACTION
}

${emoji.get("small_red_triangle_down")} Download your transactions using /${
  COMMAND_NAMES.DOWNLOAD_ANALYTICS
}`;

export const TRANSACTION_RULES_MESSAGE = `
${emoji.get(
  "warning"
)} Please enter the amount according to the following rules ${emoji.get(
  "warning"
)}

${emoji.get("exclamation")} Only numbers. For instance, *1*, *3.19*;

${emoji.get("exclamation")} Number value can't be less 0 or be equal 0;

${emoji.get("exclamation")} Without symbols and spaces;`;
