import {
  IAmountData,
  ITransactionRecord,
  TransactionType,
} from "@/types/app-context.interface";
import { transactionRepository } from "./transaction.repository";
import { ITransactionRecordStored } from "@/db/schema/transaction.schema";

export class TransactionService {
  private readonly repository = transactionRepository;

  private normalizeTransaction(
    record: ITransactionRecordStored,
  ): ITransactionRecord {
    const category =
      typeof record.category === "string" && record.category.trim().length
        ? record.category
        : "Other";

    const { ...rest } = record;

    return {
      ...rest,
      category,
    } as ITransactionRecord;
  }

  private async getTransactionsByType(key: string, type: TransactionType) {
    const items = await this.repository.getTransactionsByType(key, type);
    return items.map((item) => this.normalizeTransaction(item));
  }

  private async addTransaction(
    key: string,
    type: TransactionType,
    transaction: IAmountData,
  ) {
    await this.repository.addTransaction(key, type, transaction);
  }

  private async deleteTransactionById(
    key: string,
    type: TransactionType,
    id: number,
  ) {
    return await this.repository.deleteTransactionById(key, type, id);
  }

  private async updateTransactionById(
    key: string,
    type: TransactionType,
    id: number,
    update: Partial<Pick<IAmountData, "amount" | "category">>,
  ) {
    return await this.repository.updateTransactionById(key, type, id, update);
  }

  private async clearTransactionsByType(key: string, type: TransactionType) {
    await this.repository.clearTransactionsByType(key, type);
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
    const { total, items } = await this.repository.getTransactionsPageByKey(
      key,
      page,
      pageSize,
    );

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
