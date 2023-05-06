import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";
import storage from "node-persist";
import { delay } from "../Bot";

export interface authenticatedCharacter {
  discordId: string;
  characterId: number;
  characterName: string;
  authToken: string;
  tokenExpires: Date;
  refreshToken: string;
  nextStructureCheck: Date;
  nextNotificationCheck: Date;
  needsReAuth: boolean;
}

export interface authenticatedCorp {
  channelId: string;
  corpId: number;
  corpName: string;
  characters: authenticatedCharacter[];
  structures: GetCorporationsCorporationIdStructures200Ok[];
  nextStructureCheck: Date;
  nextNotificationCheck: Date;
  mostRecentNotification: Date;
}

const SAVE_DELAY_MS = 5 * 60 * 1000; // 5 mins in milliseconds

export class Data {
  private static DATA_KEY = "users";
  private _authenticatedCorps: authenticatedCorp[] = [];

  public async init() {
    await storage.init();
    let temp: authenticatedCorp[] = await storage.getItem(Data.DATA_KEY);
    if (!temp) {
      temp = [];
    }
    this._authenticatedCorps = temp;
    // save in a little while
    setTimeout(() => this.save(), SAVE_DELAY_MS);
  }

  get authenticatedCorps() {
    return this._authenticatedCorps;
  }

  private async save() {
    console.log("Persisting data to filesystem...");
    await storage.setItem(Data.DATA_KEY, this._authenticatedCorps);
    await delay(SAVE_DELAY_MS);
    // infinite loop required
    setTimeout(() => this.save(), 1);
  }
}
