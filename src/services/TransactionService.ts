import { ISession, SessionsService } from "./SessionService";

export class TransactionService extends SessionsService {
  constructor() {
    super();
  }

  get sessions() {
    return this.sessionsData;
  }

  async findTransactionByKey(key: string) {
    const data = await this.findSessionByKey(key);
    if (!data) return null;

    return data.data;
  }

  async updateTransactionByKey(
    key: string,
    data: Pick<ISession["data"], "expenses" | "isDailyFileReport">
  ) {
    return await this.updateSessionByKey(key, data);
  }
}

export const transactionService = new TransactionService();
