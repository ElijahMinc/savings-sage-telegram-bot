import { google } from "googleapis";
import { ConfigService } from "../../config/config.service";
import { IConfigService } from "../../config/config.interface";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
// const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];

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
}

export default new GoogleOAuthService(new ConfigService());
