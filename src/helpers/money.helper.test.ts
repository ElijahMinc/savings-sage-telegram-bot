import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatAmount, parseAmount } from "./money.helper";

describe("parseAmount", () => {
  it("parses plain integer strings", () => {
    assert.equal(parseAmount("450"), 45000);
    assert.equal(parseAmount("1"), 100);
    assert.equal(parseAmount("0"), 0);
  });

  it("parses dot-decimal strings", () => {
    assert.equal(parseAmount("450.50"), 45050);
    assert.equal(parseAmount("450.5"), 45050);
    assert.equal(parseAmount("0.01"), 1);
    assert.equal(parseAmount("0.99"), 99);
  });

  it("parses comma-decimal strings", () => {
    assert.equal(parseAmount("450,50"), 45050);
    assert.equal(parseAmount("450,5"), 45050);
  });

  it("parses space-grouped integer strings", () => {
    assert.equal(parseAmount("1 200"), 120000);
    assert.equal(parseAmount("1 000 000"), 100_000_000);
  });

  it("parses NBSP-grouped integer strings", () => {
    assert.equal(parseAmount("1\u00A0200"), 120000);
  });

  it("rounds half-up on the cent boundary", () => {
    assert.equal(parseAmount(450.005), 45001);
    assert.equal(parseAmount(0.005), 1);
  });

  it("rejects negative numbers", () => {
    assert.equal(parseAmount(-1), null);
    assert.equal(parseAmount(-0.01), null);
  });

  it("rejects non-numeric strings", () => {
    assert.equal(parseAmount("abc"), null);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("450.123"), null);
    assert.equal(parseAmount("1,2,3"), null);
  });

  it("accepts numeric zero", () => {
    assert.equal(parseAmount(0), 0);
    assert.equal(parseAmount("0"), 0);
    assert.equal(parseAmount("0.00"), 0);
  });

  it("handles numeric input", () => {
    assert.equal(parseAmount(450), 45000);
    assert.equal(parseAmount(450.5), 45050);
  });

  it("rejects non-finite numbers", () => {
    assert.equal(parseAmount(NaN), null);
    assert.equal(parseAmount(Infinity), null);
  });
});

describe("formatAmount", () => {
  it("formats whole units", () => {
    assert.equal(formatAmount(45000), "450.00");
    assert.equal(formatAmount(100), "1.00");
    assert.equal(formatAmount(0), "0.00");
  });

  it("formats fractional units", () => {
    assert.equal(formatAmount(45050), "450.50");
    assert.equal(formatAmount(45005), "450.05");
    assert.equal(formatAmount(1), "0.01");
    assert.equal(formatAmount(99), "0.99");
  });

  it("formats negative amounts", () => {
    assert.equal(formatAmount(-45050), "-450.50");
    assert.equal(formatAmount(-1), "-0.01");
  });

  it("rounds non-integer input to nearest minor unit", () => {
    assert.equal(formatAmount(450.6), "4.51");
    assert.equal(formatAmount(450.4), "4.50");
  });
});

describe("integer-only arithmetic", () => {
  it("sums parsed strings without floating drift", () => {
    const raw = ["0.10", "0.20", "0.30"];
    const total = raw.reduce((acc, s) => acc + (parseAmount(s) ?? 0), 0);
    assert.equal(total, 60);
    assert.equal(formatAmount(total), "0.60");
  });

  it("summing 100 x 0.01 gives exactly 1.00", () => {
    let total = 0;
    for (let i = 0; i < 100; i++) {
      total += parseAmount("0.01") ?? 0;
    }
    assert.equal(total, 100);
    assert.equal(formatAmount(total), "1.00");
  });
});
