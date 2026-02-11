import { IBotContext, SessionData } from "@/context/context.interface";
import {
  encryptNumber,
  getDecryptedNumber,
} from "@/helpers/encryptedNumber.helper";

const defaultSessionData = (): SessionData => ({
});

export const defaultSessionMiddleware =
  () => async (ctx: IBotContext, next: () => Promise<void>) => {
    if (!ctx.session) {
      ctx.session = defaultSessionData();
    }

    // Cleanup legacy session keys from old tag/mode model.
    delete (ctx.session as any).tags;
    delete (ctx.session as any).expenseTags;
    delete (ctx.session as any).incomeTags;
    delete (ctx.session as any).mode;

    const monthlySavingsGoal = getDecryptedNumber(ctx.session.monthlySavingsGoal);
    if (
      ctx.session.monthlySavingsGoal != null &&
      monthlySavingsGoal == null
    ) {
      ctx.session.monthlySavingsGoal = undefined;
    } else if (monthlySavingsGoal != null && monthlySavingsGoal <= 0) {
      ctx.session.monthlySavingsGoal = undefined;
    } else if (
      typeof ctx.session.monthlySavingsGoal === "number" &&
      monthlySavingsGoal != null
    ) {
      // Migrate legacy plaintext sessions to encrypted values.
      ctx.session.monthlySavingsGoal = encryptNumber(monthlySavingsGoal);
    }

    const savingsGoalExtraAmount = getDecryptedNumber(
      ctx.session.savingsGoalExtraAmount,
    );
    if (
      ctx.session.savingsGoalExtraAmount != null &&
      savingsGoalExtraAmount == null
    ) {
      ctx.session.savingsGoalExtraAmount = undefined;
    } else if (
      savingsGoalExtraAmount != null &&
      savingsGoalExtraAmount < 0
    ) {
      ctx.session.savingsGoalExtraAmount = undefined;
    } else if (
      typeof ctx.session.savingsGoalExtraAmount === "number" &&
      savingsGoalExtraAmount != null
    ) {
      // Migrate legacy plaintext sessions to encrypted values.
      ctx.session.savingsGoalExtraAmount = encryptNumber(
        savingsGoalExtraAmount,
      );
    }

    if (
      ctx.session.savingsGoalCarryoverDate != null &&
      typeof ctx.session.savingsGoalCarryoverDate !== "string"
    ) {
      ctx.session.savingsGoalCarryoverDate = undefined;
    }

    const savingsGoalCarryoverAmount = getDecryptedNumber(
      ctx.session.savingsGoalCarryoverAmount,
    );
    if (
      ctx.session.savingsGoalCarryoverAmount != null &&
      savingsGoalCarryoverAmount == null
    ) {
      ctx.session.savingsGoalCarryoverAmount = undefined;
    } else if (
      savingsGoalCarryoverAmount != null &&
      savingsGoalCarryoverAmount < 0
    ) {
      ctx.session.savingsGoalCarryoverAmount = undefined;
    } else if (
      typeof ctx.session.savingsGoalCarryoverAmount === "number" &&
      savingsGoalCarryoverAmount != null
    ) {
      // Migrate legacy plaintext sessions to encrypted values.
      ctx.session.savingsGoalCarryoverAmount = encryptNumber(
        savingsGoalCarryoverAmount,
      );
    }

    await next();
  };

