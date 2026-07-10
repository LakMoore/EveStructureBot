import type { Client } from 'discord.js';
import { EmbedBuilder, TextChannel } from 'discord.js';
import {
  STRUCTURE_CHECK_DELAY,
  NOTIFICATION_CHECK_DELAY,
  data,
  getRelativeDiscordTime,
  LOW_FUEL_WARNING,
  SUPER_LOW_FUEL_WARNING,
  colours,
  sendMessage,
} from './Bot';
import { getAccessToken, getWorkingChars } from './EveSSO';
import type { AuthenticatedCorp } from './data/data';
import type { GetCorporationStructuresResponse } from '@localisprimary/esi';
import { EsiClient } from '@localisprimary/esi';
import { LOGGER } from './Logger';

export async function checkStructuresForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  LOGGER.info('checkStructuresForCorp ' + corp.corpName);

  const workingChars = getWorkingChars(
    corp,
    corp.nextStructureCheck,
    (c) => c.nextStructureCheck,
    'Station_Manager'
  );

  if (!workingChars || workingChars.length == 0) {
    LOGGER.info('No available characters to check structures with!');
    return;
  }

  const thisChar = workingChars[0];

  if (!thisChar || new Date(thisChar.nextStructureCheck) > new Date()) {
    LOGGER.info(thisChar.characterName + ' is not ready to check structures!');
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
  const { data: structures } = await esi.getCorporationStructures({
    corporation_id: corp.corpId,
  });

  // character-level cache: each character should be held for the full delay
  const charNextCheck = Date.now() + STRUCTURE_CHECK_DELAY + 3000;
  thisChar.nextStructureCheck = new Date(charNextCheck);
  // corp-level next check should be distributed across available characters
  const corpNextCheck =
    Date.now() + Math.floor(STRUCTURE_CHECK_DELAY / workingChars.length) + 3000;

  //LOGGER.info("structs", structures);

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
    starbases: corp.starbases,
    structures: structures,
    nextStarbaseCheck: corp.nextStarbaseCheck,
    nextStructureCheck: new Date(corpNextCheck),
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: new Date(corp.mostRecentNotification ?? 0),
    setDiscordRoles: corp.setDiscordRoles,
    addedAt: corp.addedAt,
    maxCharacters: corp.maxCharacters,
    maxDirectors: corp.maxDirectors,
    mostRecentAuthAt: corp.mostRecentAuthAt,
  };

  // check for change
  await checkForStructureChangeAndPersist(client, c);
}

async function checkForStructureChangeAndPersist(
  client: Client<boolean>,
  corp: AuthenticatedCorp
) {
  // find the corp's index in our persisted storage
  // (need the index later so don't use find)
  let oldCorp = data.authenticatedCorps.find((thisCorp) => {
    return thisCorp.serverId == corp.serverId && thisCorp.corpId == corp.corpId;
  });

  if (oldCorp != undefined) {
    // seen this corp before, check each structure for changes.

    LOGGER.info(
      `Structure check for ${corp.corpName} (corpId=${corp.corpId}): oldCount=${oldCorp.structures?.length ?? 0}, newCount=${corp.structures?.length ?? 0}`
    );

    // check for new structures
    const addedStructs = corp.structures.filter(
      (s1) =>
        !oldCorp?.structures.some(
          (s2) => String(s1.structure_id) === String(s2.structure_id)
        )
    );

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const channelConfig = data.channelFor(channel);
        let message = '';
        let fuelMessage = false;
        let statusMessage = false;

        if (channelConfig.structureStatus) {
          for (const s of addedStructs) {
            await sendMessage(
              channel,
              { embeds: [generateNewStructureEmbed(s)] },
              'new structure'
            );
          }
        }

        // check for removed structures
        const removedStructs = oldCorp.structures.filter(
          (s1) =>
            !corp.structures.some(
              (s2) => String(s1.structure_id) === String(s2.structure_id)
            )
        );

        if (channelConfig.structureStatus) {
          // max embeds per message is 10
          for (const s of removedStructs) {
            await sendMessage(
              channel,
              {
                embeds: [generateDeletedStructureEmbed(s)],
              },
              'deleted structure'
            );
          }
        }

        const matchingStructs = corp.structures.filter((s1) =>
          oldCorp?.structures.some(
            (s2) => String(s1.structure_id) === String(s2.structure_id)
          )
        );
        for (const s of matchingStructs) {
          const oldStruct = oldCorp.structures.find(
            (o) => String(o.structure_id) === String(s.structure_id)
          );
          if (oldStruct) {
            let thisMessage = '';
            // check for structure status changes
            if (s.state != oldStruct?.state) {
              thisMessage
                += `\nStatus has changed from ${formatState(
                  oldStruct.state
                )} to ${formatState(s.state)}`;
              statusMessage = true;
            }
            if (s.state_timer_end !== oldStruct.state_timer_end) {
              if (s.state_timer_end) {
                thisMessage
                  += `\nStructure has a timer that ends ${getRelativeDiscordTime(
                    s.state_timer_end
                  )}`;
              }
              else {
                thisMessage += `\nStructure timer has reset`;
              }
              statusMessage = true;
            }
            // check for change of fuel (up or down!)
            if (oldStruct.fuel_expires != s.fuel_expires) {
              if (oldStruct.fuel_expires && s.fuel_expires) {
                thisMessage
                  += `\nFuel level has changed. Was expiring ${getRelativeDiscordTime(
                    oldStruct.fuel_expires
                  )} now expiring ${getRelativeDiscordTime(s.fuel_expires)}`;
              }
              else if (oldStruct.fuel_expires) {
                thisMessage
                  += `\nFuel level has changed. Was expiring ${getRelativeDiscordTime(
                    oldStruct.fuel_expires
                  )}. Now has "unknown expiry"`;
              }
              else if (s.fuel_expires) {
                thisMessage
                  += `\nFuel level has changed from "unknown expiry". Now expiring ${getRelativeDiscordTime(
                    s.fuel_expires
                  )}`;
              }
              fuelMessage = true;
            }

            // check for low fuel
            if (s.fuel_expires != undefined) {
              const expires = new Date(s.fuel_expires);

              const authedCharCount =
                Array.prototype
                  .concat(corp.members.flatMap((m) => m.characters))
                  .filter((c) => !c.needsReAuth).length ?? 1;

              if (
                // fuel expiry is within one check delay of the super low warning
                expires <= new Date(Date.now() + SUPER_LOW_FUEL_WARNING)
                && expires
                  >= new Date(
                    Date.now()
                      + SUPER_LOW_FUEL_WARNING
                      - 1000
                      - NOTIFICATION_CHECK_DELAY / authedCharCount
                  )
              ) {
                thisMessage
                  += `\n@hereURGENT: Fuel will be depleated very soon ${getRelativeDiscordTime(
                    expires
                  )}`;
                fuelMessage = true;
              }
              else if (
                // fuel expiry is within one check delay of the low warning
                expires <= new Date(Date.now() + LOW_FUEL_WARNING)
                && expires
                  >= new Date(
                    Date.now()
                      + LOW_FUEL_WARNING
                      - 1000
                      - NOTIFICATION_CHECK_DELAY / authedCharCount
                  )
              ) {
                thisMessage
                  += `\nWarning: Fuel will be depleated ${getRelativeDiscordTime(
                    expires
                  )}`;
                fuelMessage = true;
              }
            }

            if (thisMessage.length > 0) {
              thisMessage = `ALERT on ${s.name}` + thisMessage;
            }
            if (thisMessage.length > 0) {
              message += thisMessage + '\n\n';
            }
          }
        }

        if (
          message.length > 0
          && (
            (channelConfig.structureStatus && statusMessage)
            || (channelConfig.structureFuel && fuelMessage)
          )
        ) {
          await sendMessage(channel, message, 'structures: ' + message);
        }
      }
    }

    // replace the data in storage by mutating the existing object so
    // any external references remain valid and the array element is updated
    Object.assign(oldCorp, corp);
  }
  else {
    // tracking a new corp, not already in the data.

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const channelConfig = data.channelFor(channel);

        if (channelConfig.structureStatus) {
          // send individually to avoid max embed per message limit (10)
          for (const s of corp.structures) {
            await sendMessage(
              channel,
              { embeds: [generateNewStructureEmbed(s)] },
              'new structure'
            );
          }
        }
      }
    }

    // add the data to storage, but avoid creating duplicates: prefer to merge
    // into an existing entry that has the same corpId and (preferably)
    // non-empty serverId. Also union channelIds and keep the earliest
    // nextStructureCheck.
    const existingIndex = data.authenticatedCorps.findIndex(
      (existing) =>
        existing.corpId == corp.corpId
        && (
          existing.serverId == corp.serverId
          || !existing.serverId
          || !corp.serverId
        )
    );

    if (existingIndex > -1) {
      const existing = data.authenticatedCorps[existingIndex];
      const prevServerId = existing.serverId;
      const prevChannelCount = (existing.channelIds ?? []).length;
      // prefer non-empty serverId/serverName
      if ((!existing.serverId || existing.serverId == '') && corp.serverId) {
        existing.serverId = corp.serverId;
      }
      if (
        (!existing.serverName || existing.serverName == '')
        && corp.serverName
      ) {
        existing.serverName = corp.serverName;
      }
      // union channelIds
      existing.channelIds = [
        ...new Set([
          ...(existing.channelIds ?? []),
          ...(corp.channelIds ?? []),
        ]),
      ];
      if (!prevServerId && existing.serverId) {
        LOGGER.info(
          `Merged corp ${corp.corpName} (${corp.corpId}) filled serverId from structures check.`
        );
      }
      if (prevChannelCount < (existing.channelIds ?? []).length) {
        LOGGER.info(
          `Merged corp ${corp.corpName} (${corp.corpId}) added ${(existing.channelIds ?? []).length - prevChannelCount} channel(s) from structures check.`
        );
      }
      // replace structures with the newly-fetched list
      existing.structures = corp.structures;
      // set nextStructureCheck to the earliest (minimum) desired check time
      try {
        const existingNext = new Date(existing.nextStructureCheck).getTime();
        const corpNext = new Date(corp.nextStructureCheck).getTime();
        existing.nextStructureCheck = new Date(
          Math.min(existingNext || Infinity, corpNext || Infinity)
        );
      }
      catch {
        // ignore and leave existing value
      }
      data.authenticatedCorps[existingIndex] = existing;
    }
    else {
      data.authenticatedCorps.push(corp);
      if (!corp.serverId || (corp.channelIds ?? []).length == 0) {
        LOGGER.warning(
          `structures: adding corp ${corp.corpName} (${corp.corpId}) with serverId="${corp.serverId}" channels=${JSON.stringify(corp.channelIds)}`
        );
      }
    }
  }
  await data.save();
}

function generateNewStructureEmbed(
  s: GetCorporationStructuresResponse[number]
) {
  let fuelMessage = 'Fuel has been depleated!';
  if (s.fuel_expires != undefined) {
    const expires = new Date(s.fuel_expires);
    if (expires > new Date()) {
      fuelMessage = `Fuel will be depleated ${getRelativeDiscordTime(expires)}`;
    }
  }
  let message = '';
  if (s.state_timer_end != undefined) {
    const ends = new Date(s.state_timer_end);
    message = `\nCurrent timer ends ${getRelativeDiscordTime(ends)}`;
  }

  const badgeUrl = `https://images.evetech.net/corporations/${s.corporation_id}/logo?size=64`;

  return new EmbedBuilder()
    .setColor(colours.green)
    .setAuthor({
      name: 'New structure',
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(s.name ?? 'Unknown Structure')
    .setDescription(`Status: ${formatState(s.state)}\n${fuelMessage}` + message)
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

function generateDeletedStructureEmbed(
  s: GetCorporationStructuresResponse[number]
) {
  const badgeUrl = `https://images.evetech.net/corporations/${s.corporation_id}/logo?size=64`;

  return new EmbedBuilder()
    .setColor(colours.red)
    .setAuthor({
      name: 'Deleted structure',
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(s.name ?? 'Unknown Structure')
    .setDescription('Structure is no longer part of the corporation!')
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

// anchor_vulnerable, anchoring, armor_reinforce,
// armor_vulnerable, deploy_vulnerable, fitting_invulnerable,
// hull_reinforce, hull_vulnerable, online_deprecated,
// onlining_vulnerable, shield_vulnerable, unanchored, unknown
function formatState(
  state: GetCorporationStructuresResponse[number]['state']
): string {
  switch (state) {
  case 'armor_reinforce':
    return 'shield depleated';
  case 'armor_vulnerable':
    return 'partial shields';
  case 'hull_reinforce':
    return 'armor depleated';
  case 'hull_vulnerable':
    return 'partial armor';
  case 'anchoring':
    return 'anchoring';
  case 'unanchored':
    return 'unanchored';
  case 'shield_vulnerable':
    return 'full shields';
  default:
    return 'unknown';
  }
}
