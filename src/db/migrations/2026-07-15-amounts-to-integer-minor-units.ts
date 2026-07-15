import "../../register-aliases";
import crypto from "crypto";
import { config } from "dotenv";
import { mongoDbClient, connectToMongo, disconnectFromMongo } from "@/db/connection";

config();

const MIGRATION_NAME = "2026-07-15-amounts-to-integer-minor-units";
const AMOUNT_SCHEMA_VERSION = 2;

interface LegacyEncryptedAmount {
  iv: string;
  content: string;
}

function isLegacyEncrypted(value: unknown): value is LegacyEncryptedAmount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LegacyEncryptedAmount).iv === "string" &&
    typeof (value as LegacyEncryptedAmount).content === "string"
  );
}

function decryptLegacyAmount(hash: LegacyEncryptedAmount): number {
  const algorithm = process.env.ALGORITHM;
  const secretKey = process.env.SECRET_KEY;

  if (!algorithm || !secretKey) {
    throw new Error(
      "ALGORITHM and SECRET_KEY env vars are required to decrypt legacy records",
    );
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    secretKey,
    Buffer.from(hash.iv, "hex"),
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, "hex")),
    decipher.final(),
  ]);
  const parsed = Number(decrypted.toString());

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Failed to parse decrypted amount: "${decrypted.toString()}"`,
    );
  }

  return parsed;
}

function mainUnitsToMinor(value: number): number {
  return Math.round(value * 100);
}

function resolveMinorUnits(rawAmount: unknown): number | null {
  if (isLegacyEncrypted(rawAmount)) {
    return mainUnitsToMinor(decryptLegacyAmount(rawAmount));
  }

  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    return mainUnitsToMinor(rawAmount);
  }

  return null;
}

interface Stats {
  scanned: number;
  converted: number;
  skipped: number;
  failed: number;
}

async function migrateTransactions(dryRun: boolean): Promise<Stats> {
  const stats: Stats = { scanned: 0, converted: 0, skipped: 0, failed: 0 };
  const cursor = mongoDbClient
    .collection("transactions")
    .find({ amountSchema: { $ne: AMOUNT_SCHEMA_VERSION } });

  for await (const doc of cursor) {
    stats.scanned++;

    try {
      const minor = resolveMinorUnits(doc.amount);

      if (minor == null) {
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] transactions._id=${doc._id} amount: ${JSON.stringify(
            doc.amount,
          )} -> ${minor}`,
        );
      } else {
        await mongoDbClient.collection("transactions").updateOne(
          { _id: doc._id },
          { $set: { amount: minor, amountSchema: AMOUNT_SCHEMA_VERSION } },
        );
      }

      stats.converted++;
    } catch (error) {
      stats.failed++;
      console.error(
        `Failed to convert transactions._id=${doc._id}:`,
        (error as Error).message,
      );
    }
  }

  return stats;
}

const SESSION_MONEY_FIELDS = [
  "monthlySavingsGoal",
  "savingsGoalExtraAmount",
  "savingsGoalCarryoverAmount",
] as const;

async function migrateSessions(dryRun: boolean): Promise<Stats> {
  const stats: Stats = { scanned: 0, converted: 0, skipped: 0, failed: 0 };
  const cursor = mongoDbClient
    .collection("sessions")
    .find({ amountSchema: { $ne: AMOUNT_SCHEMA_VERSION } });

  for await (const doc of cursor) {
    stats.scanned++;

    const data = (doc.data ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    let hasField = false;

    try {
      for (const field of SESSION_MONEY_FIELDS) {
        if (data[field] == null) {
          continue;
        }

        hasField = true;
        const minor = resolveMinorUnits(data[field]);

        if (minor == null) {
          update[`data.${field}`] = undefined;
        } else {
          update[`data.${field}`] = minor;
        }
      }

      if (!hasField) {
        if (!dryRun) {
          await mongoDbClient
            .collection("sessions")
            .updateOne(
              { _id: doc._id },
              { $set: { amountSchema: AMOUNT_SCHEMA_VERSION } },
            );
        }
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] sessions._id=${doc._id} updates: ${JSON.stringify(update)}`,
        );
      } else {
        const setPayload: Record<string, unknown> = {
          amountSchema: AMOUNT_SCHEMA_VERSION,
        };
        const unsetPayload: Record<string, unknown> = {};

        for (const [k, v] of Object.entries(update)) {
          if (v === undefined) {
            unsetPayload[k] = "";
          } else {
            setPayload[k] = v;
          }
        }

        await mongoDbClient.collection("sessions").updateOne(
          { _id: doc._id },
          {
            $set: setPayload,
            ...(Object.keys(unsetPayload).length ? { $unset: unsetPayload } : {}),
          },
        );
      }

      stats.converted++;
    } catch (error) {
      stats.failed++;
      console.error(
        `Failed to convert sessions._id=${doc._id}:`,
        (error as Error).message,
      );
    }
  }

  return stats;
}

async function main() {
  const dryRun = process.env.MIGRATION_DRY_RUN === "1";
  console.log(`Migration: ${MIGRATION_NAME} (dryRun=${dryRun})`);

  if (!dryRun) {
    console.log("!! Make sure you have a backup of the database.");
  }

  await connectToMongo();

  try {
    const transactionsStats = await migrateTransactions(dryRun);
    console.log("transactions:", transactionsStats);

    const sessionsStats = await migrateSessions(dryRun);
    console.log("sessions:", sessionsStats);
  } finally {
    await disconnectFromMongo();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
