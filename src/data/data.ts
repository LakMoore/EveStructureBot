import type {
  GetCharacterRolesResponse,
  GetCorporationStarbasesResponse,
  GetCorporationStructuresResponse,
} from '@localisprimary/esi';
import storage from 'node-persist';
import type { TextChannel } from 'discord.js';
import { LOGGER } from '../Logger';
import { setInterval } from 'node:timers/promises';

export interface AuthenticatedCharacter {
  roles?: GetCharacterRolesResponse;
  // compact role map for frequently checked roles
  roleMap?: {
    Director?: boolean;
    Station_Manager?: boolean;
    Starbase_Fuel_Technician?: boolean;
  };
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
  nextRolesCheck: Date;
  needsReAuth: boolean;
  addedAt: Date;
  mostRecentAuthAt: Date;
  authFailedAt: Date;
}

export interface CorpMember {
  discordId: string;
  characters: AuthenticatedCharacter[];
}

export interface AuthenticatedCorp {
  serverId: string;
  serverName: string;
  /** @deprecated use channelIds instead */
  channelId: string | undefined;
  channelIds: string[];
  corpId: number;
  corpName: string;
  members: CorpMember[];
  /** @deprecated fetch a character via members[] */
  characters: AuthenticatedCharacter[] | undefined;
  starbases: GetCorporationStarbasesResponse; // already an array
  structures: GetCorporationStructuresResponse; // already an array
  nextStructureCheck: Date;
  nextStarbaseCheck: Date;
  nextNotificationCheck: Date;
  mostRecentNotification: Date;
  setDiscordRoles: boolean;
  addedAt: Date;
  maxCharacters: number;
  maxDirectors: number;
  mostRecentAuthAt: Date;
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
  private static readonly CORPS_DATA_KEY = 'users';
  private static readonly CHANNELS_DATA_KEY = 'channels';
  private static readonly UPDATE_ANNOUNCEMENT_KEY = 'last_update_announcement';
  private _authenticatedCorps: AuthenticatedCorp[] = [];
  private _channels: DiscordChannel[] = [];
  private _lastUpdateAnnouncement = '';

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
    const tempLastUpdateAnnouncement: string | undefined =
      await storage.getItem(Data.UPDATE_ANNOUNCEMENT_KEY);
    this._lastUpdateAnnouncement = tempLastUpdateAnnouncement ?? '';

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
              const charIdx = corpMember.characters.findIndex(
                (c) => c.characterId === thisCharacter.characterId
              );

              if (charIdx > -1) {
                // if the member already has this character, copy over the top
                corpMember.characters[charIdx] = thisCharacter;
              }
              else {
                // if the member does not have this character, add it
                corpMember.characters.push(thisCharacter);
              }
            }
            else {
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

      // upgrade channelId to channelIds
      if (thisCorp.channelId != undefined) {
        thisCorp.channelIds ??= [];
        thisCorp.channelIds.push(thisCorp.channelId);
        thisCorp.channelId = undefined;
        upgraded = true;
      }

      // check whether this corp is already in the list
      // Improved dedupe: merge entries by corpId; prefer non-empty serverId and
      // union channelIds. Build a map of corps to merge deterministically.
      // We'll perform a pass after collecting all entries.

      if (!thisCorp.serverName) {
        thisCorp.serverName = '';
        upgraded = true;
      }

      const mostRecentNotificationMs = new Date(
        thisCorp.mostRecentNotification
      ).getTime();
      if (Number.isNaN(mostRecentNotificationMs)) {
        thisCorp.mostRecentNotification = new Date(0);
        upgraded = true;
      }

      const serverCountForCorp = this._authenticatedCorps.filter(
        (c) => c.corpId == thisCorp.corpId
      ).length;

      if (serverCountForCorp > 1) {
        const allServerNames = this._authenticatedCorps
          .filter((c) => c.corpId == thisCorp.corpId && c.serverName)
          .map((c) => c.serverName);
        LOGGER.warning(
          '!!! Found a duplicate corp across '
            + serverCountForCorp
            + ' servers: '
            + thisCorp.corpName
            + '\nServers:\n'
            + allServerNames.join('\n')
        );
      }

      if (!thisCorp.addedAt) {
        thisCorp.addedAt = new Date();
        upgraded = true;
      }

      if (!thisCorp.mostRecentAuthAt) {
        thisCorp.mostRecentAuthAt = new Date();
        upgraded = true;
      }

      if (!thisCorp.maxCharacters) {
        thisCorp.maxCharacters = 0;
        upgraded = true;
      }

      if (!thisCorp.maxDirectors) {
        thisCorp.maxDirectors = 0;
        upgraded = true;
      }

      if (thisCorp.setDiscordRoles == undefined) {
        thisCorp.setDiscordRoles = false;
        upgraded = true;
      }

      for (const member of thisCorp.members) {
        if (member.characters.length > 1) {
          const dedupedCharacters: AuthenticatedCharacter[] = [];

          for (const character of member.characters) {
            const existingIndex = dedupedCharacters.findIndex(
              (c) => c.characterId == character.characterId
            );

            if (existingIndex == -1) {
              dedupedCharacters.push(character);
            }
            else {
              const existing = dedupedCharacters[existingIndex];

              const existingAuthAt = new Date(
                existing.mostRecentAuthAt
              ).getTime();
              const incomingAuthAt = new Date(
                character.mostRecentAuthAt
              ).getTime();

              let merged = existing;
              let other = character;

              if (
                !Number.isNaN(incomingAuthAt)
                && (
                  Number.isNaN(existingAuthAt)
                  || incomingAuthAt > existingAuthAt
                )
              ) {
                merged = character;
                other = existing;
              }

              if (!merged.authToken && other.authToken) {
                merged.authToken = other.authToken;
              }
              if (!merged.refreshToken && other.refreshToken) {
                merged.refreshToken = other.refreshToken;
              }

              const mergedTokenExpires = new Date(
                merged.tokenExpires
              ).getTime();
              const otherTokenExpires = new Date(other.tokenExpires).getTime();
              if (
                !Number.isNaN(otherTokenExpires)
                && (
                  Number.isNaN(mergedTokenExpires)
                  || otherTokenExpires > mergedTokenExpires
                )
              ) {
                merged.tokenExpires = other.tokenExpires;
              }

              merged.needsReAuth = merged.needsReAuth && other.needsReAuth;

              if (
                // migrate legacy full roles payload into compact roleMap when merging
                (!merged.roleMap || Object.keys(merged.roleMap).length === 0)
                && other.roles?.roles != undefined
              ) {
                merged.roleMap = {
                  Director: other.roles.roles.includes('Director'),
                  Station_Manager:
                    other.roles.roles.includes('Station_Manager'),
                  Starbase_Fuel_Technician: other.roles.roles.includes(
                    'Starbase_Fuel_Technician'
                  ),
                };
              }

              dedupedCharacters[existingIndex] = merged;
              upgraded = true;
            }
          }

          if (dedupedCharacters.length != member.characters.length) {
            member.characters = dedupedCharacters;
            upgraded = true;
          }
        }

        // for each character, initialise the lastAuth and authfailed
        member.characters.forEach((character) => {
          if (!character.addedAt) {
            character.addedAt = new Date();
            upgraded = true;
          }
          if (!character.mostRecentAuthAt) {
            if (character.needsReAuth) {
              character.mostRecentAuthAt = new Date(0);
            }
            else {
              character.mostRecentAuthAt = new Date();
            }
            upgraded = true;
          }
          if (!character.authFailedAt) {
            if (character.needsReAuth) {
              character.authFailedAt = new Date();
            }
            else {
              character.authFailedAt = new Date(0);
            }
            upgraded = true;
          }

          // Ensure compact roleMap exists. If legacy roles are present, migrate them.
          if (character.roles?.roles != undefined) {
            character.roleMap = {
              Director: character.roles.roles.includes('Director'),
              Station_Manager:
                character.roles.roles.includes('Station_Manager'),
              Starbase_Fuel_Technician: character.roles.roles.includes(
                'Starbase_Fuel_Technician'
              ),
            };
            upgraded = true;
          }
          else if (!character.roleMap) {
            character.roleMap = {};
            upgraded = true;
          }
          if (!character.nextRolesCheck) {
            character.nextRolesCheck = new Date();
            upgraded = true;
          }
        });
      }
    }

    // Perform deterministic dedupe/merge across all authenticatedCorps.
    const mergedMap: { [key: string]: AuthenticatedCorp } = {};
    for (const c of this._authenticatedCorps) {
      const key = String(c.corpId);
      if (!mergedMap[key]) {
        // clone to avoid mutating original while iterating
        mergedMap[key] = structuredClone(c);
      }
      else {
        const existing = mergedMap[key];
        // prefer non-empty serverId/serverName
        if ((!existing.serverId || existing.serverId == '') && c.serverId) {
          existing.serverId = c.serverId;
        }
        if (
          (!existing.serverName || existing.serverName == '')
          && c.serverName
        ) {
          existing.serverName = c.serverName;
        }
        // union channelIds
        existing.channelIds = [
          ...new Set([...(existing.channelIds ?? []), ...(c.channelIds ?? [])]),
        ];
        // merge members: combine members by discordId
        for (const m of c.members) {
          const mi = existing.members.findIndex(
            (x) => x.discordId == m.discordId
          );
          if (mi == -1) {
            existing.members.push(m);
          }
          else {
            // merge characters, prefer those with authToken and latest mostRecentAuthAt
            for (const ch of m.characters) {
              const chi = existing.members[mi].characters.findIndex(
                (x) => x.characterId == ch.characterId
              );
              if (chi == -1) {
                existing.members[mi].characters.push(ch);
              }
              else {
                const existingChar = existing.members[mi].characters[chi];
                if (!existingChar.authToken && ch.authToken) {
                  existing.members[mi].characters[chi] = ch;
                }
              }
            }
          }
        }
        // prefer earliest nextStructureCheck
        try {
          const existingNext = new Date(existing.nextStructureCheck).getTime();
          const cNext = new Date(c.nextStructureCheck).getTime();
          existing.nextStructureCheck = new Date(
            Math.min(existingNext || Infinity, cNext || Infinity)
          );
        }
        catch {
          // ignore
        }
        // prefer latest mostRecentAuthAt
        try {
          const existingMostRecent = new Date(
            existing.mostRecentAuthAt
          ).getTime();
          const cMostRecent = new Date(c.mostRecentAuthAt).getTime();
          existing.mostRecentAuthAt = new Date(
            Math.max(existingMostRecent || 0, cMostRecent || 0)
          );
        }
        catch {
          // ignore
        }
      }
    }

    const originalHash = JSON.stringify(this._authenticatedCorps);
    const mergedHash = JSON.stringify(Object.values(mergedMap));

    if (upgraded || originalHash != mergedHash) {
      await this.backup();

      // Replace with merged list
      if (originalHash != mergedHash) {
        LOGGER.warning('Replacing saved Corps with merged Corps object.');
        this._authenticatedCorps = Object.values(mergedMap);
      }
      if (upgraded) {
        LOGGER.warning('Upgraded the datastore to new schema.');
      }
      LOGGER.info('Upgraded the datastore to new schema.');
      await this.save();
    }

    // Perform cleanup of corps with missing server/channel info.
    try {
      const toKeep: AuthenticatedCorp[] = [];
      const toRemove: { corp: AuthenticatedCorp; reason: string }[] = [];

      for (const c of this._authenticatedCorps) {
        const channelsLen = (c.channelIds ?? []).length;
        if (channelsLen === 0) {
          toRemove.push({ corp: c, reason: 'no channels' });
          continue;
        }

        if (!c.serverId || c.serverId == '' || c.serverId == 'undefined') {
          toRemove.push({ corp: c, reason: 'no serverId' });
          continue;
        }

        // default: keep
        toKeep.push(c);
      }

      if (toRemove.length > 0) {
        // backup before destructive changes
        await this.backup();
        for (const r of toRemove) {
          LOGGER.warning(
            `Removing corp due to missing server/channel info: ${r.corp.corpName} (${r.corp.corpId}) reason=${r.reason} serverId="${r.corp.serverId}" channels=${JSON.stringify(r.corp.channelIds)}`
          );
        }
        // apply removal
        this._authenticatedCorps = toKeep;
        // persist the cleaned dataset
        await this.save();
      }
    }
    catch (err) {
      LOGGER.error('Error during cleanup pass: ' + String(err));
    }
    // save in a little while (do not await here, let it run in the background)
    return this.autoSave();
  }

  get authenticatedCorps() {
    return this._authenticatedCorps;
  }

  get lastUpdateAnnouncement() {
    return this._lastUpdateAnnouncement;
  }

  set lastUpdateAnnouncement(value: string) {
    this._lastUpdateAnnouncement = value;
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
      // infinite loop required
      for await (const _ of setInterval(SAVE_DELAY_MS)) {
        await this.save();
      }
    }
    catch (error) {
      LOGGER.error(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async save() {
    LOGGER.info('Persisting data to filesystem...');
    // create a copy and strip large `roles` payloads from characters before persisting
    try {
      const persistCopy: AuthenticatedCorp[] = structuredClone(
        this._authenticatedCorps
      );
      for (const c of persistCopy) {
        if (c.members) {
          for (const m of c.members) {
            for (const ch of m.characters) {
              // remove the heavy roles payload; keep compact roleMap only
              try {
                delete ch.roles;
              }
              catch {
                // ignore
              }
            }
          }
        }
      }
      // telemetry: report corps with missing serverId or empty channelIds
      try {
        for (const c of persistCopy) {
          if (
            !c.serverId
            || c.serverId == ''
            || (c.channelIds ?? []).length == 0
          ) {
            LOGGER.warning(
              `Persisting corp with missing server/channel info: ${c.corpName} (${c.corpId}) serverId="${c.serverId}" channels=${JSON.stringify(c.channelIds)}`
            );
          }
        }
      }
      catch {
        // ignore telemetry failures
      }
      await storage.setItem(Data.CORPS_DATA_KEY, persistCopy);
    }
    catch {
      // fallback to saving the original if something unexpected happens
      await storage.setItem(Data.CORPS_DATA_KEY, this._authenticatedCorps);
    }
    await storage.setItem(Data.CHANNELS_DATA_KEY, this._channels);
    await storage.setItem(
      Data.UPDATE_ANNOUNCEMENT_KEY,
      this._lastUpdateAnnouncement
    );
    // Debug: log a brief summary of persisted corps and structure counts
    // Uncomment the following block if you want to see a summary of persisted corps and structure counts on each save. This can be useful for debugging, but may produce a lot of log output in production.
    // try {
    //   for (const c of this._authenticatedCorps) {
    //     LOGGER.info(
    //       `Persisted corp ${c.corpName} (${c.corpId}) on Server ${c.serverName} (${c.serverId}) with ${c.structures?.length ?? 0} structures and ${c.channelIds.length} channels.`
    //     );
    //     if (c.corpId == 98170261) {
    //       LOGGER.info(
    //         `Full dump for ${c.corpName} (${c.corpId}): ${JSON.stringify(c, null, 2)}`
    //       );
    //     }
    //   }
    // }
    // catch (err) {
    //   LOGGER.error(
    //     'Error while logging persisted corp summary: ' + String(err)
    //   );
    // }
  }

  public async backup() {
    LOGGER.info('Creating a backup of data to filesystem...');
    const tempCorps = await storage.getItem(Data.CORPS_DATA_KEY);
    const tempChannels = await storage.getItem(Data.CHANNELS_DATA_KEY);
    await storage.setItem(
      Data.CORPS_DATA_KEY + '_backup_' + Date.now().toString(),
      tempCorps
    );
    await storage.setItem(
      Data.CHANNELS_DATA_KEY + '_backup_' + Date.now().toString(),
      tempChannels
    );
  }

  public async removeChannel(channelId: string) {
    LOGGER.info('Removing channel ' + channelId);

    await this.backup();

    // update the authenticated corps to remove this channel from them
    const corpsInChannel = this._authenticatedCorps.filter((c) =>
      c.channelIds.includes(channelId)
    );
    LOGGER.info(
      'Found ' + corpsInChannel.length + ' corps in channel ' + channelId
    );
    if (corpsInChannel.length > 0) {
      corpsInChannel.forEach((c) => {
        c.channelIds = c.channelIds.filter((c) => c != channelId);
      });
    }

    // report on corps with no channels
    const corpsWithNoChannels = this._authenticatedCorps.filter(
      (c) => c.channelIds.length == 0
    );
    LOGGER.info(
      'Found ' + corpsWithNoChannels.length + ' corps with no channels!'
    );

    // No need to actually delete the corp

    // remove the channel from the channels list
    this._channels = this._channels.filter((c) => c.channelId != channelId);
    await this.save();
  }

  public async clear() {
    await storage.clear();
    LOGGER.warning('Cleared all persistent storage!!!');
  }
}
