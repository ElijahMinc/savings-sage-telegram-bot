import { Singleton } from "@/patterns/Singleton";
import cron from "node-cron";

class CronTaskTrackerService {
  private db: Singleton = Singleton.get();

  get(key: string): cron.ScheduledTask | undefined {
    return this.db.map.get(key);
  }

  values() {
    return this.db.map.values();
  }

  has(roomId: string): boolean {
    return this.db.map.has(roomId);
  }

  set(key: string, value: cron.ScheduledTask): void {
    this.db.map.set(key, value);
  }

  keys(): IterableIterator<string> {
    return this.db.map.keys();
  }

  forEach(
    callbackfn: (value: any, key: any, map: Map<any, any>) => void,
    thisArg?: any
  ): void {
    return this.db.map.forEach(callbackfn);
  }

  clear(room: Map<string, cron.ScheduledTask>) {
    room.clear();
  }

  delete(key: string) {
    this.db.map.delete(key);
  }
}

export default new CronTaskTrackerService();
