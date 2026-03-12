import { config } from "dotenv";
import { IConfigService } from "./config.interface";

export class ConfigService implements IConfigService {
  private readonly config: Record<string, string | undefined>;

  constructor() {
    const { error, parsed } = config();

    if (error && !this.isMissingEnvFileError(error)) {
      throw new Error(`Failed to load environment variables: ${error.message}`);
    }

    this.config = {
      ...parsed,
      ...process.env,
    };
  }

  get(key: string): string {
    const res = this.config[key];

    if (!res) {
      throw new Error(`Environment variable "${key}" is not set`);
    }

    return res;
  }

  private isMissingEnvFileError(error: Error & { code?: string }): boolean {
    return error.code === "ENOENT";
  }
}
