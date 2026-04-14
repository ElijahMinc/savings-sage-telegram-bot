import { collections } from "@/db/collections";
import { ITransactionRecordStored } from "@/db/schema/transaction.schema";
import { IAmountData, TransactionType } from "@/types/app-context.interface";
import { MongoServerError } from "mongodb";

export class TransactionRepository {
  private readonly transactions = collections.transactions;
  private indexInitPromise: Promise<string[]> | null = null;

  private isNamespaceNotFoundError(error: unknown) {
    return (
      error instanceof MongoServerError &&
      (error.code === 26 || error.codeName === "NamespaceNotFound")
    );
  }

  async ensureIndexes() {
    if (!this.indexInitPromise) {
      this.indexInitPromise = (async () => {
        try {
          let existingIndexes: Awaited<
            ReturnType<typeof this.transactions.indexes>
          > = [];

          try {
            existingIndexes = await this.transactions.indexes();
          } catch (error) {
            if (!this.isNamespaceNotFoundError(error)) {
              throw error;
            }
          }

          const legacyUniqueIndex = existingIndexes.find((index) => {
            const keyNames = Object.keys(index.key ?? {});
            return (
              index.unique === true &&
              keyNames.length === 3 &&
              index.key?.key === 1 &&
              index.key?.type === 1 &&
              index.key?.id === 1
            );
          });

          if (legacyUniqueIndex?.name) {
            try {
              await this.transactions.dropIndex(legacyUniqueIndex.name);
            } catch (error) {
              if (!this.isNamespaceNotFoundError(error)) {
                throw error;
              }
            }
          }

          return Promise.all([
            this.transactions.createIndex({ key: 1, type: 1 }),
            this.transactions.createIndex(
              { key: 1, type: 1, id: 1 },
              { unique: true },
            ),
            this.transactions.createIndex({ key: 1, created_date: -1, id: -1 }),
          ]);
        } catch (error) {
          this.indexInitPromise = null;
          throw error;
        }
      })();
    }

    await this.indexInitPromise;
  }

  async getTransactionsByType(key: string, type: TransactionType) {
    return this.transactions
      .find({ key, type })
      .sort({ created_date: 1 })
      .toArray();
  }

  async addTransaction(
    key: string,
    type: TransactionType,
    transaction: IAmountData,
  ) {
    const { ...payload } = transaction;
    await this.transactions.insertOne({ ...payload, key, type });
  }

  async deleteTransactionById(key: string, type: TransactionType, id: number) {
    const { deletedCount } = await this.transactions.deleteOne({
      key,
      type,
      id,
    });
    return deletedCount > 0;
  }

  async updateTransactionById(
    key: string,
    type: TransactionType,
    id: number,
    update: Partial<Pick<IAmountData, "amount" | "category">>,
  ) {
    const { matchedCount } = await this.transactions.updateOne(
      { key, type, id },
      { $set: update },
    );

    return matchedCount > 0;
  }

  async clearTransactionsByType(key: string, type: TransactionType) {
    await this.transactions.deleteMany({ key, type });
  }

  async getTransactionsPageByKey(key: string, page: number, pageSize: number) {
    const skip = Math.max(0, page) * pageSize;

    const [total, items] = await Promise.all([
      this.transactions.countDocuments({ key }),
      this.transactions
        .find<ITransactionRecordStored>({ key })
        .sort({ created_date: -1, id: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
    ]);

    return { total, items };
  }
}

export const transactionRepository = new TransactionRepository();
