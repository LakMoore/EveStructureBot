import {
  GetCorporationsCorporationIdStarbases200Ok,
  GetCorporationsCorporationIdStructures200Ok,
} from "eve-client-ts";
import storage from "node-persist";
import { consoleLog, delay } from "../Bot";
import { TextChannel } from "discord.js";

export interface AuthenticatedCharacter {
  discordId: string;
  characterId: number;
  characterName: string;
  corpId: number;
  authToken: string;
  tokenExpires: Date;
  refreshToken: string;
  nextStructureCheck: Date;
  nextStarbaseCheck: Date;
  nextNotificationCheck: Date;
  needsReAuth: boolean;
}

export interface CorpMember {
  discordId: string;
  characters: AuthenticatedCharacter[];
}

export interface AuthenticatedCorp {
  serverId: string;
  channelId: string;
  corpId: number;
  corpName: string;
  members: CorpMember[];
  /**
   * @deprecated fetch a character via members[]
   */
  characters: AuthenticatedCharacter[] | undefined;
  starbases: GetCorporationsCorporationIdStarbases200Ok[];
  structures: GetCorporationsCorporationIdStructures200Ok[];
  nextStructureCheck: Date;
  nextStarbaseCheck: Date;
  nextNotificationCheck: Date;
  mostRecentNotification: Date;
  setDiscordRoles: boolean;
}

export interface DiscordChannel {
  serverId: string;
  channelId: string;
  name: string;
  low_fuel_role?: string;
  attack_alert_role?: string;
  starbaseFuel: boolean;
  starbaseStatus: boolean;
  structureFuel: boolean;
  structureStatus: boolean;
  miningUpdates: boolean;
}

const SAVE_DELAY_MS = 5 * 60 * 1000; // 5 mins in milliseconds

export class Data {
  private static CORPS_DATA_KEY = "users";
  private static CHANNELS_DATA_KEY = "channels";
  private _authenticatedCorps: AuthenticatedCorp[] = [];
  private _channels: DiscordChannel[] = [];

  public async init() {
    await storage.init();

    let temp: AuthenticatedCorp[] = await storage.getItem(Data.CORPS_DATA_KEY);
    if (!temp) {
      temp = [];
    }
    this._authenticatedCorps = temp;

    let tempChannels: DiscordChannel[] = await storage.getItem(
      Data.CHANNELS_DATA_KEY
    );
    if (!tempChannels) {
      tempChannels = [];
    }

    let upgraded = false;

    for (const thisChannel of tempChannels) {
      if (thisChannel.starbaseFuel === undefined) {
        thisChannel.starbaseFuel = true;
        upgraded = true;
      }
      if (thisChannel.starbaseStatus === undefined) {
        thisChannel.starbaseStatus = true;
        upgraded = true;
      }
      if (thisChannel.structureFuel === undefined) {
        thisChannel.structureFuel = true;
        upgraded = true;
      }
      if (thisChannel.structureStatus === undefined) {
        thisChannel.structureStatus = true;
        upgraded = true;
      }
      if (thisChannel.miningUpdates === undefined) {
        thisChannel.miningUpdates = true;
        upgraded = true;
      }
    }

    this._channels = tempChannels;

    for (const thisCorp of this._authenticatedCorps) {
      if (!thisCorp.members) {
        thisCorp.members = [];
        upgraded = true;
      }

      if (!thisCorp.starbases) {
        thisCorp.starbases = [];
        thisCorp.nextStarbaseCheck = new Date();
        thisCorp.members.forEach((m) => {
          m.characters.forEach((c) => {
            c.nextStarbaseCheck = new Date();
          });
        });
        upgraded = true;
      }

      if (thisCorp.characters) {
        // if characters exists, let's upgrade to the new layout
        thisCorp.characters.forEach((thisCharacter) => {
          if (thisCorp) {
            const memberIdx = thisCorp.members.findIndex(
              (corpMember) => corpMember.discordId === thisCharacter.discordId
            );
            if (memberIdx > -1) {
              const corpMember = thisCorp.members[memberIdx];
              const charIdx = corpMember.characters.findIndex((c) => {
                c.characterId === thisCharacter.characterId;
              });

              if (charIdx > -1) {
                // if the member already has this character, copy over the top
                corpMember.characters[charIdx] = thisCharacter;
              } else {
                // if the member does not have this character, add it
                corpMember.characters.push(thisCharacter);
              }
            } else {
              // if this member is not in our list, add them with this initial character attached
              thisCorp.members.push({
                discordId: thisCharacter.discordId,
                characters: [thisCharacter],
              });
            }
          }
        });
        // then delete the old property
        delete thisCorp.characters;
        upgraded = true;
      }

      if (thisCorp.setDiscordRoles == undefined) {
        thisCorp.setDiscordRoles = false;
        upgraded = true;
      }
    }

    if (upgraded) {
      consoleLog("Upgraded the datastore to new schema.");
      this.save();
    }

    // save in a little while
    setTimeout(() => this.autoSave(), SAVE_DELAY_MS);
  }

  get authenticatedCorps() {
    return this._authenticatedCorps;
  }

  public channelFor(channel: TextChannel) {
    let tempChannel = this._channels.find((c) => c.channelId == channel.id);
    if (!tempChannel) {
      tempChannel = {
        serverId: channel.guild.id,
        channelId: channel.id,
        name: channel.name,
        starbaseFuel: true,
        starbaseStatus: true,
        structureFuel: true,
        structureStatus: true,
        miningUpdates: true,
      };
      this._channels.push(tempChannel);
    }
    return tempChannel;
  }

  private async autoSave() {
    try {
      await this.save();
      await delay(SAVE_DELAY_MS);
      // infinite loop required
      setTimeout(async () => await this.autoSave(), 1);
    } catch (error) {
      consoleLog("An error occured in autoSave", error);
    }
  }

  public async save() {
    consoleLog("Persisting data to filesystem...");
    await storage.setItem(Data.CORPS_DATA_KEY, this._authenticatedCorps);
    await storage.setItem(Data.CHANNELS_DATA_KEY, this._channels);
  }

  public async removeChannel(channelId: string) {
    this._authenticatedCorps = this._authenticatedCorps.filter(
      (corp) => corp.channelId != channelId
    );
    this._channels = this._channels.filter((c) => c.channelId != channelId);
    this.save();
  }

  public async clear() {
    await storage.clear();
    consoleLog("Cleared all persistent storage!!!");
  }
}
