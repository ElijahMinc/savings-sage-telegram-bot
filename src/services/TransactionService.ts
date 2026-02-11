import {
  IAmountData,
  ITransactionRecord,
  TransactionType,
} from "@/context/context.interface";
import { mongoDbClient } from "@/db/connection";

type ITransactionRecordStored = Omit<ITransactionRecord, "category"> & {
  category?: string;
  tag?: string;
};

class TransactionService {
  private transactions = mongoDbClient.collection<ITransactionRecordStored>(
    "transactions",
  );

  private normalizeTransaction(
    record: ITransactionRecordStored,
  ): ITransactionRecord {
    const category =
      typeof record.category === "string" && record.category.trim().length
        ? record.category
        : typeof record.tag === "string" && record.tag.trim().length
          ? record.tag
          : "Other";

    const { tag: _legacyTag, ...rest } = record;

    return {
      ...rest,
      category,
    } as ITransactionRecord;
  }

  private async getTransactionsByType(key: string, type: TransactionType) {
    const items = await this.transactions
      .find({ key, type })
      .sort({ created_date: 1 })
      .toArray();

    return items.map((item) => this.normalizeTransaction(item));
  }

  private async addTransaction(
    key: string,
    type: TransactionType,
    transaction: IAmountData,
  ) {
    const { tag: _legacyTag, ...payload } = transaction;
    await this.transactions.insertOne({ ...payload, key, type });
  }

  private async deleteTransactionById(
    key: string,
    type: TransactionType,
    id: number,
  ) {
    const { deletedCount } = await this.transactions.deleteOne({ key, type, id });
    return deletedCount > 0;
  }

  private async updateTransactionById(
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

  private async clearTransactionsByType(key: string, type: TransactionType) {
    await this.transactions.deleteMany({ key, type });
  }

  async getExpensesByKey(key: string) {
    return await this.getTransactionsByType(key, "expense");
  }

  async getIncomeByKey(key: string) {
    return await this.getTransactionsByType(key, "income");
  }

  async addExpense(key: string, transaction: IAmountData) {
    await this.addTransaction(key, "expense", transaction);
  }

  async addIncome(key: string, transaction: IAmountData) {
    await this.addTransaction(key, "income", transaction);
  }

  async deleteExpenseById(key: string, id: number) {
    return await this.deleteTransactionById(key, "expense", id);
  }

  async deleteIncomeById(key: string, id: number) {
    return await this.deleteTransactionById(key, "income", id);
  }

  async clearExpensesByKey(key: string) {
    await this.clearTransactionsByType(key, "expense");
  }

  async clearIncomeByKey(key: string) {
    await this.clearTransactionsByType(key, "income");
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

    return {
      total,
      items: items.map((item) => this.normalizeTransaction(item)),
    };
  }

  async updateExpenseById(
    key: string,
    id: number,
    update: Partial<Pick<IAmountData, "amount" | "category">>,
  ) {
    return await this.updateTransactionById(key, "expense", id, update);
  }

  async updateIncomeById(
    key: string,
    id: number,
    update: Partial<Pick<IAmountData, "amount" | "category">>,
  ) {
    return await this.updateTransactionById(key, "income", id, update);
  }
}

export const transactionService = new TransactionService();
