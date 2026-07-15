/* eslint-disable @typescript-eslint/no-explicit-any */
import { IBotContext, SessionData } from "@/types/app-context.interface";
import { isValidReminderTimezone } from "@/helpers/reminderSchedule.helper";

const defaultSessionData = (): SessionData => ({});

const sanitizeAmount = (
  value: unknown,
  { allowZero }: { allowZero: boolean },
): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (allowZero ? value < 0 : value <= 0) {
    return undefined;
  }

  return value;
};

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

    ctx.session.monthlySavingsGoal = sanitizeAmount(
      ctx.session.monthlySavingsGoal,
      { allowZero: false },
    );
    ctx.session.savingsGoalExtraAmount = sanitizeAmount(
      ctx.session.savingsGoalExtraAmount,
      { allowZero: true },
    );
    ctx.session.savingsGoalCarryoverAmount = sanitizeAmount(
      ctx.session.savingsGoalCarryoverAmount,
      { allowZero: true },
    );

    if (
      ctx.session.savingsGoalCarryoverDate != null &&
      typeof ctx.session.savingsGoalCarryoverDate !== "string"
    ) {
      ctx.session.savingsGoalCarryoverDate = undefined;
    }

    if (
      ctx.session.timezone != null &&
      !isValidReminderTimezone(ctx.session.timezone)
    ) {
      ctx.session.timezone = undefined;
    }

    await next();
  };
