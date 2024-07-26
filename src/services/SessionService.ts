import { SessionData } from "@/context/context.interface";
import { mongoDbClient } from "@/db/connection";

export interface ISession {
  data: SessionData;
}

export class SessionsService {
  protected sessionsData = mongoDbClient.collection<ISession[]>("sessions");
  constructor() {}

  get sessions() {
    return this.sessionsData;
  }

  protected async findSessionByKey(key: string) {
    return await this.sessionsData.findOne<ISession>({ key });
  }

  protected async updateSessionByKey<
    T extends Record<string, unknown> | ISession["data"]
  >(key: string, data: T) {
    return await this.sessionsData.updateOne({ key }, [{ $set: { data } }]);
  }
}
