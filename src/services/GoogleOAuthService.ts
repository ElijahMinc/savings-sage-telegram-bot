import { google } from "googleapis";
import { IConfigService } from "@config/config.interface";
import { SCOPES } from "@/constants";
import { ConfigService } from "@/config/config.service";
import { AuthPlus } from "googleapis/build/src/googleapis";

class GoogleOAuthService {
  oauth2Client: any;

  constructor(private readonly configService: IConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
      "http://localhost:3001/api/google/oauth2callback"
    );
  }

  async getOAuth2Client(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    return { tokens };
  }

  async generateAuthUrl() {
    return await this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
  }

  get client() {
    return this.oauth2Client;
  }
}

const googleOAuthService = new GoogleOAuthService(new ConfigService());

export { googleOAuthService };
