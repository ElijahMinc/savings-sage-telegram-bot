import { config, DotenvParseOutput } from "dotenv";
import { IConfigService } from "./config.interface";

export class ConfigService implements IConfigService {
  private config: DotenvParseOutput;

  constructor() {
    const { error, parsed } = config();

    if (error) {
      throw new Error("The .env file was not found");
    }

    if (!parsed) {
      throw new Error("The .env file is empty");
    }

    this.config = parsed;
  }

  get(key: string): string {
    const res = this.config[key];

    console.log("res", res);
    console.log("res[key]", res);
    if (!res) {
      throw new Error(`The key:${key} is not exist`);
    }

    return res;
  }
}
