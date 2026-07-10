import type { Client } from 'discord.js';
import { EmbedBuilder, TextChannel } from 'discord.js';
import {
  colours,
  data,
  getRelativeDiscordTime,
  sendMessage,
  STRUCTURE_CHECK_DELAY,
} from './Bot';
import type { AuthenticatedCorp } from './data/data';
import { getWorkingChars, getAccessToken } from './EveSSO';
import type { GetCorporationStarbasesResponse } from '@localisprimary/esi';
import { EsiClient } from '@localisprimary/esi';
import { LOGGER } from './Logger';

export async function checkStarbasesForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  LOGGER.info('checkStarbasesForCorp ' + corp.corpName);

  const workingChars = getWorkingChars(
    corp,
    corp.nextStarbaseCheck,
    (c) => c.nextStarbaseCheck,
    'Director'
  );

  if (!workingChars || workingChars.length == 0) {
    LOGGER.info('No available characters to check starbases with!');
    return;
  }

  const thisChar = workingChars[0];

  if (!thisChar || new Date(thisChar.nextStarbaseCheck) > new Date()) {
    LOGGER.info(thisChar.characterName + ' is not ready to check starbases!');
    return;
  }

  const token = await getAccessToken(thisChar);
  if (!token) {
    LOGGER.info('No access token for character ' + thisChar.characterName);
    return;
  }

  LOGGER.info('Using ' + thisChar.characterName);

  const esi = new EsiClient({
    userAgent: 'EveStructureBot',
    token,
  });
  const { data: starbases } = await esi.getCorporationStarbases({
    corporation_id: corp.corpId,
  });

  // character-level cache: each character should be held for the full delay
  const charNextCheck = Date.now() + STRUCTURE_CHECK_DELAY + 1000;
  thisChar.nextStarbaseCheck = new Date(charNextCheck);
  // corp-level next check should be distributed across available characters
  const corpNextCheck =
    Date.now() + Math.floor(STRUCTURE_CHECK_DELAY / workingChars.length) + 1000;

  // make a new object so we can compare it to the old one
  const c: AuthenticatedCorp = {
    serverId: corp.serverId,
    serverName: corp.serverName,
    channelId: undefined,
    channelIds: corp.channelIds,
    corpId: corp.corpId,
    corpName: corp.corpName,
    members: corp.members,
    characters: undefined,
    starbases: starbases,
    structures: corp.structures,
    nextStarbaseCheck: new Date(corpNextCheck),
    nextStructureCheck: corp.nextStructureCheck,
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: corp.mostRecentNotification,
    setDiscordRoles: corp.setDiscordRoles,
    addedAt: corp.addedAt,
    maxCharacters: corp.maxCharacters,
    maxDirectors: corp.maxDirectors,
    mostRecentAuthAt: corp.mostRecentAuthAt,
  };

  // check for change
  await checkForStarbaseChangeAndPersist(client, c);
}

async function checkForStarbaseChangeAndPersist(
  client: Client<boolean>,
  corp: AuthenticatedCorp
) {
  // find the user in our persisted storage
  const idx = data.authenticatedCorps.findIndex((thisCorp) => {
    return thisCorp.serverId == corp.serverId && thisCorp.corpId == corp.corpId;
  });

  if (idx > -1) {
    // seen this before, check each starbase for changes.
    const oldCorp = data.authenticatedCorps[idx];
    const oldMostRecentNotification = new Date(oldCorp.mostRecentNotification);
    if (Number.isNaN(oldMostRecentNotification.getTime())) {
      oldCorp.mostRecentNotification = new Date(0);
    }

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const channelConfig = data.channelFor(channel);
        let message = '';
        let fuelMessage = false;
        let statusMessage = false;

        if (channelConfig.starbaseStatus) {
          // check for new starbase
          const addedStarbase = corp.starbases.filter(
            (s1) =>
              !oldCorp.starbases.some(
                (s2) => String(s1.starbase_id) === String(s2.starbase_id)
              )
          );

          for (const s of addedStarbase) {
            await sendMessage(
              channel,
              {
                embeds: [await generateNewStarbaseEmbed(s, corp)],
              },
              'added starbase'
            );
          }

          // check for removed starbases
          const removedStarbases = oldCorp.starbases.filter(
            (s1) =>
              !corp.starbases.some(
                (s2) => String(s1.starbase_id) === String(s2.starbase_id)
              )
          );

          // max embeds per message is 10
          for (const s of removedStarbases) {
            await sendMessage(
              channel,
              {
                embeds: [await generateDeletedStarbasesEmbed(s, corp)],
              },
              'removed starbase'
            );
          }
        }

        const matchingStarbases = corp.starbases.filter((s1) =>
          oldCorp.starbases.some(
            (s2) => String(s1.starbase_id) === String(s2.starbase_id)
          )
        );
        for (const s of matchingStarbases) {
          const oldStarbase = oldCorp.starbases.find(
            (o) => String(o.starbase_id) === String(s.starbase_id)
          );
          if (oldStarbase) {
            let thisMessage = '';
            // check for starbase status changes
            if (s.state != oldStarbase?.state) {
              thisMessage
                += `\nStatus has changed from ${oldStarbase.state} to ${s.state}`;
            }
            if (s.reinforced_until !== oldStarbase.reinforced_until) {
              if (s.reinforced_until) {
                thisMessage
                  += `\nStarbase has a reinforcement timer that ends ${getRelativeDiscordTime(
                    s.reinforced_until
                  )}`;
              }
              else {
                thisMessage += `\nStarbase reinforcement timer has reset`;
              }
            }
            if (s.unanchor_at !== oldStarbase.unanchor_at) {
              if (s.unanchor_at) {
                thisMessage
                  += `\nStarbase has an unanchor timer that started ${getRelativeDiscordTime(
                    s.unanchor_at
                  )}`;
              }
              else {
                thisMessage += `\nStarbase unanchor timer has reset`;
              }
            }

            const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

            if (thisMessage.length > 0) {
              thisMessage = `ALERT on Starbase ${starbaseName}` + thisMessage;
            }

            if (thisMessage.length > 0) {
              message += thisMessage + '\n\n';
            }
          }
        }

        if (message.length > 0) {
          await sendMessage(channel, message, 'Starbases');
        }
      }
    }

    // replace the data in storage
    corp.mostRecentNotification = oldCorp.mostRecentNotification;
    data.authenticatedCorps[idx] = corp;
  }
  else {
    // tracking new starbases!

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        // send individually to avoid max embed per message limit (10)
        for (const s of corp.starbases) {
          await sendMessage(
            channel,
            {
              embeds: [await generateNewStarbaseEmbed(s, corp)],
            },
            'New Starbase'
          );
        }
      }
    }

    const mostRecentNotification = new Date(corp.mostRecentNotification);
    if (Number.isNaN(mostRecentNotification.getTime())) {
      corp.mostRecentNotification = new Date(0);
    }

    const alreadyTracked = data.authenticatedCorps.some(
      (existingCorp) =>
        existingCorp.serverId == corp.serverId
        && existingCorp.corpId == corp.corpId
    );

    if (!alreadyTracked) {
      // add the data to storage
      data.authenticatedCorps.push(corp);
      if (!corp.serverId || (corp.channelIds ?? []).length == 0) {
        LOGGER.warning(
          `starbases: adding corp ${corp.corpName} (${corp.corpId}) with serverId="${corp.serverId}" channels=${JSON.stringify(corp.channelIds)}`
        );
      }
    }
  }

  await data.save();
}

async function generateNewStarbaseEmbed(
  s: GetCorporationStarbasesResponse[number],
  corp: AuthenticatedCorp
) {
  let message = '';

  if (s.reinforced_until != undefined) {
    const ends = new Date(s.reinforced_until);
    message = `\nReinforcement timer ends ${getRelativeDiscordTime(ends)}`;
  }

  if (s.unanchor_at != undefined) {
    const started = new Date(s.unanchor_at);
    message = `\nUnanchoring started ${getRelativeDiscordTime(started)}`;
  }

  const badgeUrl = `https://images.evetech.net/corporations/${corp.corpId}/logo?size=64`;
  const starbaseType = await getStarbaseType(s.type_id);
  const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.green)
    .setAuthor({
      name: 'New Starbase',
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(starbaseName)
    .setDescription(`Type: ${starbaseType}\nStatus: ${s.state}${message}`)
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

async function generateDeletedStarbasesEmbed(
  s: GetCorporationStarbasesResponse[number],
  corp: AuthenticatedCorp
) {
  const badgeUrl = `https://images.evetech.net/corporations/${corp.corpId}/logo?size=64`;

  const starbaseType = await getStarbaseType(s.type_id);
  const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.red)
    .setAuthor({
      name: 'Deleted Starbase',
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(starbaseName)
    .setDescription(
      `Type: ${starbaseType}\nStarbase is no longer part of the corporation!`
    )
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

async function getStarbaseType(type_id: number) {
  const esi = new EsiClient({
    userAgent: 'EveStructureBot',
  });
  const { data: result } = await esi.getUniverseType({ type_id });
  if (result) {
    return result.name;
  }
  return 'Unknown Type';
}

export async function getStarbaseName(
  system_id?: string | number,
  moon_id?: string | number
) {
  const systemName = await getSystemName(system_id);
  const moonName = await getMoonName(moon_id);

  let nameText = moonName;
  if (!moonName.startsWith(systemName)) {
    nameText = systemName + ' - ' + moonName;
  }
  return nameText;
}

export async function getSystemName(system_id?: string | number) {
  if (system_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getUniverseSystem({ system_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown System';
}

export async function getRegionNameFromSystemId(system_id?: string | number) {
  if (system_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: systemResult } = await esi.getUniverseSystem({
      system_id,
    });
    if (systemResult) {
      const { data: constellationResult } = await esi.getUniverseConstellation({
        constellation_id: systemResult.constellation_id,
      });
      if (constellationResult) {
        const { data: regionResult } = await esi.getUniverseRegion({
          region_id: constellationResult.region_id,
        });
        if (regionResult) {
          return regionResult.name;
        }
      }
    }
  }
  return 'Unknown Region';
}

export async function getItemName(type_id?: string | number) {
  if (type_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getUniverseType({ type_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Item';
}

export async function getMoonName(moon_id?: string | number) {
  if (moon_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getUniverseMoon({ moon_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Moon';
}

export async function getPlanetName(planet_id?: number) {
  if (planet_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getUniversePlanet({ planet_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Planet';
}

// Get Character name from ID
export async function getCharacterName(character_id?: number) {
  if (character_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getCharacter({ character_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Character';
}

// Get Corp Name from ID
export async function getCorpName(corporation_id?: number | string) {
  if (corporation_id) {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getCorporation({ corporation_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Corporation';
}

// Get Alliance Name from ID
export async function getAllianceName(alliance_id?: number | string) {
  if (alliance_id && alliance_id != 'null') {
    const esi = new EsiClient({
      userAgent: 'EveStructureBot',
    });
    const { data: result } = await esi.getAlliance({ alliance_id });
    if (result) {
      return result.name;
    }
  }
  return 'Unknown Alliance';
}
