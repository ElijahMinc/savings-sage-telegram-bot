import "../../register-aliases";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { computeExpenseLimitResult } from "./expense-limit.service";

const JULY_15_NOON = new Date(2026, 6, 15, 12, 0, 0);
const DAYS_IN_JULY = 31;
const REMAINING_DAYS = DAYS_IN_JULY - 15 + 1;

describe("computeExpenseLimitResult", () => {
  it("returns dailyLimit=null when no savings goal is set", () => {
    const result = computeExpenseLimitResult({
      totalExpensesToday: 0,
      monthlyExpenses: 0,
      monthlyIncome: 200_000,
      monthlySavingsGoal: undefined,
      now: JULY_15_NOON,
    });

    assert.equal(result.dailyLimit, null);
    assert.equal(result.snapshot, null);
    assert.equal(result.isLimitExceeded, false);
    assert.equal(result.overspentAmount, 0);
    assert.deepEqual(result.sessionUpdates, {});
  });

  it("computes a floored daily limit in minor units", () => {
    const result = computeExpenseLimitResult({
      totalExpensesToday: 0,
      monthlyExpenses: 0,
      monthlyIncome: 100_000,
      monthlySavingsGoal: 20_000,
      now: JULY_15_NOON,
    });

    const expected = Math.floor((100_000 - 20_000) / REMAINING_DAYS);
    assert.equal(result.dailyLimit, expected);
    assert.equal(Number.isInteger(result.dailyLimit ?? 0), true);
  });

  it("flags limit exceeded and reports overspend in minor units", () => {
    const monthlyIncome = 100_000;
    const monthlySavingsGoal = 20_000;

    const spendingHigh = 20_000;
    const result = computeExpenseLimitResult({
      totalExpensesToday: spendingHigh,
      monthlyExpenses: spendingHigh,
      monthlyIncome,
      monthlySavingsGoal,
      now: JULY_15_NOON,
    });

    assert.equal(result.isLimitExceeded, true);
    assert.equal(result.overspentAmount, spendingHigh - (result.dailyLimit ?? 0));
    assert.ok((result.overspentAmount ?? 0) > 0);
    assert.equal(Number.isInteger(result.overspentAmount), true);
  });

  it("accumulates savingsGoalExtraAmount when spending stays under the limit", () => {
    const first = computeExpenseLimitResult({
      totalExpensesToday: 0,
      monthlyExpenses: 0,
      monthlyIncome: 100_000,
      monthlySavingsGoal: 20_000,
      savingsGoalExtraAmount: 1_000,
      now: JULY_15_NOON,
    });

    const carryover = first.sessionUpdates.savingsGoalCarryoverAmount;
    const extra = first.sessionUpdates.savingsGoalExtraAmount;

    assert.equal(first.sessionUpdates.savingsGoalCarryoverDate, "2026-07-15");
    assert.equal(typeof carryover, "number");
    assert.equal(Number.isInteger(carryover ?? 0), true);
    assert.equal(carryover, first.dailyLimit);
    assert.equal(extra, 1_000 + (carryover ?? 0));
  });

  it("only credits the delta when re-called on the same day", () => {
    const priorCarryover = 500;

    const result = computeExpenseLimitResult({
      totalExpensesToday: 0,
      monthlyExpenses: 0,
      monthlyIncome: 100_000,
      monthlySavingsGoal: 20_000,
      savingsGoalExtraAmount: 2_000,
      savingsGoalCarryoverDate: "2026-07-15",
      savingsGoalCarryoverAmount: priorCarryover,
      now: JULY_15_NOON,
    });

    const newCarryover = result.sessionUpdates.savingsGoalCarryoverAmount ?? 0;
    const delta = newCarryover - priorCarryover;
    assert.equal(result.sessionUpdates.savingsGoalExtraAmount, 2_000 + delta);
  });

  it("all outputs stay integer for integer inputs", () => {
    const result = computeExpenseLimitResult({
      totalExpensesToday: 12_345,
      monthlyExpenses: 200_000,
      monthlyIncome: 500_000,
      monthlySavingsGoal: 100_000,
      now: JULY_15_NOON,
    });

    assert.equal(Number.isInteger(result.totalExpensesToday), true);
    assert.equal(Number.isInteger(result.dailyLimit ?? 0), true);
    assert.equal(Number.isInteger(result.overspentAmount), true);
    assert.equal(Number.isInteger(result.snapshot?.remainingExpenseBudget ?? 0), true);
    assert.equal(Number.isInteger(result.snapshot?.autoDailyLimit ?? 0), true);
  });
});
