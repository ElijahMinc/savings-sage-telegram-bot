import { SessionData } from "@/context/context.interface";
import { mongoDbClient } from "@/db/connection";

export interface ISession {
  key: string;
  data: SessionData;
}

export class SessionsService {
  protected sessionsData = mongoDbClient.collection<ISession>("sessions");
  constructor() {}

  get sessions() {
    return this.sessionsData;
  }

  protected async findSessionByKey(key: string) {
    return await this.sessionsData.findOne<ISession>({ key });
  }

  async getSessionByKey(key: string) {
    return await this.findSessionByKey(key);
  }

  async getSessionDataByKey(key: string) {
    const session = await this.findSessionByKey(key);
    return session?.data ?? null;
  }

  protected async updateSessionByKey<
    T extends Partial<ISession["data"]>
  >(key: string, data: T) {
    const setPayload = Object.entries(data).reduce<Record<string, unknown>>(
      (acc, [field, value]) => {
        acc[`data.${field}`] = value;
        return acc;
      },
      {}
    );

    if (!Object.keys(setPayload).length) {
      return null;
    }

    return await this.sessionsData.updateOne(
      { key },
      { $set: setPayload },
      { upsert: true }
    );
  }
}

export const sessionsService = new SessionsService();
