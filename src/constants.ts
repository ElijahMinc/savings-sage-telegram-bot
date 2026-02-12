import * as emoji from "node-emoji";
import { Markup } from "telegraf";

export enum COMMAND_NAMES {
  START = "start",
  TRANSACTIONS = "transactions",
  BALANCE = "balance",
  SAVINGS_GOAL = "savings_goal",
  ANALYTICS = "analytic",
  REMIND = "remind",
}

export enum SCENES_NAMES {
  EXPENSES_SCENE = "EXPENSES_SCENE",
  INCOME_SCENE = "INCOME_SCENE",
  TRANSACTIONS_SCENE = "TRANSACTIONS_SCENE",

  EXIT_FROM_SCENE = "EXIT",
}

export const commands = Object.freeze([
  {
    command: COMMAND_NAMES.START,
    description: "Start command",
  },
  {
    command: COMMAND_NAMES.TRANSACTIONS,
    description: "Show and edit recent transactions",
  },
  {
    command: COMMAND_NAMES.BALANCE,
    description:
      "Show spent today, savings goal, monthly income and spending status",
  },
  {
    command: COMMAND_NAMES.SAVINGS_GOAL,
    description: "Set monthly savings goal (daily limit is auto-calculated)",
  },
  {
    command: COMMAND_NAMES.ANALYTICS,
    description: "View monthly analytics report",
  },
  {
    command: COMMAND_NAMES.REMIND,
    description: "Schedule recurring reminder for total expenses",
  },
]);

export const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Products",
  "Cafe",
  "Transport",
  "Home",
  "Health",
  "Entertainment",
  "Other",
];

export const DEFAULT_INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Bonus",
  "Gift",
  "Other",
];

export const DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS = 30;

export const regexAllSymbols = new RegExp(
  /[\/+\-!@#$%^&*()_+=[\]{};:'",.<>?\\|`~]/,
);

export const regexStrictNumber = new RegExp(/^\d+(\.\d+)?$/);

export const regexSlash = new RegExp(/\//);

export const transactionDefaultFormatDate = "DD-MM-YYYY";

export const dailyReportCRONMask = "* * * * *";
// * * * * * - one minute

export const EXIT_BUTTON = Markup.button.callback(
  `Exit ${emoji.get("door")}`,
  SCENES_NAMES.EXIT_FROM_SCENE,
);

export const COME_BACK_MESSAGE = `You've come back at home commands ${emoji.get(
  "house",
)}`;

export const START_COMMAND_MESSAGE = `
Add expenses and income in seconds.

Just send an amount in format:
5
5 products
+1000 salary

Commands:

1) ${emoji.get("bar_chart")} /${COMMAND_NAMES.BALANCE} - balance overview;

2) ${emoji.get("bar_chart")} /${COMMAND_NAMES.ANALYTICS} - view and download monthly analytics;

3) ${emoji.get("calendar")} /${COMMAND_NAMES.SAVINGS_GOAL} - monthly goal and limit;

4) ${emoji.get("receipt")} /${COMMAND_NAMES.TRANSACTIONS} - view and edit transactions;

5) ${emoji.get("bell")} /${COMMAND_NAMES.REMIND} - recurring expense reminders;

`;

export const TRANSACTION_RULES_MESSAGE = `
${emoji.get(
  "warning",
)} Please enter the amount according to the following rules ${emoji.get(
  "warning",
)}

${emoji.get("exclamation")} Only numbers. For instance, *1*, *3.19*;

${emoji.get("exclamation")} Number value can't be less 0 or be equal 0;

${emoji.get("exclamation")} Without symbols and spaces;`;
