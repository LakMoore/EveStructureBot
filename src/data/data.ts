import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";
import storage from "node-persist";
import { consoleLog, delay } from "../Bot";

export interface AuthenticatedCharacter {
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

export interface AuthenticatedCorp {
  channelId: string;
  corpId: number;
  corpName: string;
  characters: AuthenticatedCharacter[];
  structures: GetCorporationsCorporationIdStructures200Ok[];
  nextStructureCheck: Date;
  nextNotificationCheck: Date;
  mostRecentNotification: Date;
}

const SAVE_DELAY_MS = 5 * 60 * 1000; // 5 mins in milliseconds

export class Data {
  private static DATA_KEY = "users";
  private _authenticatedCorps: AuthenticatedCorp[] = [];

  public async init() {
    await storage.init();
    let temp: AuthenticatedCorp[] = await storage.getItem(Data.DATA_KEY);
    if (!temp) {
      temp = [];
    }
    this._authenticatedCorps = temp;
    // save in a little while
    setTimeout(() => this.autoSave(), SAVE_DELAY_MS);
  }

  get authenticatedCorps() {
    return this._authenticatedCorps;
  }

  private async autoSave() {
    await this.save();
    await delay(SAVE_DELAY_MS);
    // infinite loop required
    setTimeout(() => this.save(), 1);
  }

  public async save() {
    consoleLog("Persisting data to filesystem...");
    await storage.setItem(Data.DATA_KEY, this._authenticatedCorps);
  }

  public async removeChannel(channelId: string) {
    this._authenticatedCorps = this._authenticatedCorps.filter(
      (corp) => corp.channelId != channelId
    );
    this.save();
  }

  public async clear() {
    await storage.clear();
    consoleLog("Cleared all persistent storage!!!");
  }
}
