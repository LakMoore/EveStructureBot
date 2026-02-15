/*
{
    is_read: true,
    notification_id: 1767889141,
    sender_id: 1000137,
    sender_type: 'corporation',
    text: 'allianceID: 99011699\n' +
      'allianceLinkData:\n' +
      '- showinfo\n' +
      '- 16159\n' +
      '- 99011699\n' +
      'allianceName: We Forsakened Few\n' +
      'armorPercentage: 100.0\n' +
      'charID: 2117375278\n' +
      'corpLinkData:\n' +
      '- showinfo\n' +
      '- 2\n' +
      '- 840323545\n' +
      'corpName: The Forsakened Few\n' +
      'hullPercentage: 100.0\n' +
      'shieldPercentage: 94.98224673480567\n' +
      'solarsystemID: 31001712\n' +
      'structureID: &id001 1039189968644\n' +
      'structureShowInfoData:\n' +
      '- showinfo\n' +
      '- 35835\n' +
      '- *id001\n' +
      'structureTypeID: 35835\n',
    timestamp: '2023-05-03T21:41:00Z',
    type: 'StructureUnderAttack'
  }*/

import { Client, Colors, TextChannel } from 'discord.js';
import { AuthenticatedCorp, DiscordChannel } from './data';
import { DOTLAN_MAP_URL } from '../embeds/structureNotification';
import { consoleLog, data, getRelativeDiscordTime, sendMessage } from '../Bot';
import {
  getAllianceName,
  getCharacterName,
  getCorpName,
  getItemName,
  getMoonName,
  getPlanetName,
  getRegionNameFromSystemId,
  getSystemName,
} from '../starbases';
import { GetCharacterNotificationsResponse } from '@localisprimary/esi';
import { generateGeneralNotificationEmbed } from '../embeds/generalNotification';

export function parseNotificationText(text?: string) {
  if (text) {
    const lines = text.split('\n');
    const result: { [key: string]: string } = {};
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].replace('&id001', '').trim();
        result[key] = value;
      }
    }
    return result;
  }
  return {};
}

export const messageTypes = new Map<
  GetCharacterNotificationsResponse[number]['type'],
  {
    message: string;
    colour: number;
    get_role_to_mention: (c: DiscordChannel) => string | undefined;
    handler: (
      client: Client<boolean>,
      corp: AuthenticatedCorp,
      note: GetCharacterNotificationsResponse[number],
      message: string,
      colour: number,
      role_to_mention: (c: DiscordChannel) => string | undefined,
      structureStateMessage: boolean,
      structureFuelMessage: boolean,
      miningUpdatesMessage: boolean
    ) => Promise<void>;
    structureStateMessage: boolean;
    structureFuelMessage: boolean;
    miningUpdatesMessage: boolean;
  }
>();

export function initNotifications() {
  messageTypes.set('SkyhookUnderAttack', {
    message: 'SKYHOOK UNDER ATTACK',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleSkyhookNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('SkyhookLostShields', {
    message: 'SKYHOOK LOST SHIELDS',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleSkyhookNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('SkyhookDeployed', {
    message: 'SKYHOOK DEPLOYED',
    colour: Colors.Green,
    get_role_to_mention: (c) => undefined,
    handler: handleSkyhookNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('SkyhookDestroyed', {
    message: 'SKYHOOK DESTROYED',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleSkyhookNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('SkyhookOnline', {
    message: 'SKYHOOK ONLINE',
    colour: Colors.Green,
    get_role_to_mention: (c) => undefined,
    handler: handleSkyhookNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureUnderAttack', {
    message: 'STRUCTURE UNDER ATTACK',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('MoonminingExtractionStarted', {
    message: 'Moon mining extraction started',
    colour: Colors.Blue,
    get_role_to_mention: () => undefined,
    handler: handleMoonMiningNotification,
    structureStateMessage: false,
    structureFuelMessage: false,
    miningUpdatesMessage: true,
  });

  messageTypes.set('MoonminingExtractionFinished', {
    message: 'Moon mining extraction finished',
    colour: Colors.Blue,
    get_role_to_mention: () => undefined,
    handler: handleMoonMiningNotification,
    structureStateMessage: false,
    structureFuelMessage: false,
    miningUpdatesMessage: true,
  });

  messageTypes.set('MoonminingAutomaticFracture', {
    message: 'Moon mining automatic fracture triggered',
    colour: Colors.Blue,
    get_role_to_mention: () => undefined,
    handler: handleMoonMiningNotification,
    structureStateMessage: false,
    structureFuelMessage: false,
    miningUpdatesMessage: true,
  });

  messageTypes.set('MoonminingLaserFired', {
    message: 'Moon mining laser fired',
    colour: Colors.Blue,
    get_role_to_mention: () => undefined,
    handler: handleMoonMiningNotification,
    structureStateMessage: false,
    structureFuelMessage: false,
    miningUpdatesMessage: true,
  });

  messageTypes.set('StructureFuelAlert', {
    message: 'Structure low on fuel',
    colour: Colors.Yellow,
    get_role_to_mention: (c) => c.low_fuel_role,
    handler: handleStructureNotification,
    structureStateMessage: false,
    structureFuelMessage: true,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureDestroyed', {
    message: 'Structure destroyed',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureLostArmor', {
    message: 'Structure armor depleated',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureLostShields', {
    message: 'Structure shields depleated',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureOnline', {
    message: 'Structure online',
    colour: Colors.Green,
    get_role_to_mention: (c) => undefined,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureServicesOffline', {
    message: 'Structure services offline',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.low_fuel_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureUnanchoring', {
    message: 'Structure has started unanchoring',
    colour: Colors.Red,
    get_role_to_mention: (c) => undefined,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureWentHighPower', {
    message: 'Structure power restored',
    colour: Colors.Green,
    get_role_to_mention: (c) => undefined,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: true,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureWentLowPower', {
    message: 'Structure power failed',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.low_fuel_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: true,
    miningUpdatesMessage: false,
  });

  messageTypes.set('OrbitalAttacked', {
    message: 'POCO Attacked',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('OrbitalReinforced', {
    message: 'POCO Re-inforced',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('TowerAlertMsg', {
    message: 'POS Under Attack',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleTowerNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('TowerResourceAlertMsg', {
    message: 'POS Needs Resources',
    colour: Colors.Red,
    get_role_to_mention: (c) => c.low_fuel_role,
    handler: handleTowerNotification,
    structureStateMessage: false,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('StructureAnchoring', {
    message: 'Structure Anchoring',
    colour: Colors.Yellow,
    get_role_to_mention: (c) => undefined,
    handler: handleStructureNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  // TODO: need to parse multiple structures to handle this notification.
  // messageTypes.set('StructuresReinforcementChanged', {
  //   message: 'Structure Reinforcement Time Changed',
  //   colour: Colors.Yellow,
  //   get_role_to_mention: (c) => undefined,
  //   handler: handleStructureNotification,
  //   structureStateMessage: true,
  //   structureFuelMessage: false,
  //   miningUpdatesMessage: false,
  // });

  messageTypes.set('WarDeclared', {
    message: 'War Declared',
    colour: Colors.Red,
    get_role_to_mention: (c) => undefined,
    handler: handleWarDeclaredNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });

  messageTypes.set('SovStructureReinforced', {
    message: 'Sovereignty Hub Reinforced',
    colour: Colors.Orange,
    get_role_to_mention: (c) => c.attack_alert_role,
    handler: handleSovStructureReinforcedNotification,
    structureStateMessage: true,
    structureFuelMessage: false,
    miningUpdatesMessage: false,
  });
}

//https://evemaps.dotlan.net/alliance/PUT_THE_FRIES_IN_THE_BAG
const dotLanAllianceURL = 'https://evemaps.dotlan.net/alliance/';
//https://evemaps.dotlan.net/corp/Another_Drone_Regions_Crab_Corp
const dotLanCorpURL = 'https://evemaps.dotlan.net/corp/';

async function handleSkyhookNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  message: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);
    // don't use itemID, it cannot be resolved via ESI
    const planetID = Number(values['planetID']) || 0;
    const planetName = await getPlanetName(planetID);
    const solarsystemID = Number(values['solarsystemID']) || 0;
    const systemName = await getSystemName(solarsystemID);
    const typeID = Number(values['typeID']) || 0;
    const typeName = await getItemName(typeID);

    let dotLanLink = `Unknown System`;
    if (solarsystemID) {
      dotLanLink = `[${systemName}](${DOTLAN_MAP_URL}${systemName.replaceAll(' ', '_')})`;
    }

    const regionName = await getRegionNameFromSystemId(solarsystemID);

    let details = `\n\nWhat: ${typeName}\nWhere: Planet ${planetName.replace(systemName, '').trim()} in ${dotLanLink} (${regionName})`;

    if (values['timestamp'] && values['vulnerableTime']) {
      const jsTimestamp = filetimeToJsTimestamp(values['timestamp']); // 1764937640000 (ms since 1970)
      details +=
        '\n\nThe structure will exit reinforcement ' +
        getRelativeDiscordTime(new Date(jsTimestamp));
    }

    details += await generateStructureAggressorStatement(values);
    details += generateDefenceLevelsStatement(values, 1); // Skyhooks give shield/armor/hull values as 0-100

    const thumbnail = `https://images.evetech.net/types/${typeID}/render?size=64`;

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);

        if (
          (structureStateMessage && thisChannel.structureStatus) ||
          (structureFuelMessage && thisChannel.structureFuel)
        ) {
          let content;
          const role = role_to_mention(thisChannel);
          if (role) {
            content = `<@&${role}>`;
          }

          await sendMessage(
            channel,
            {
              content,
              embeds: [
                generateGeneralNotificationEmbed(
                  colour,
                  message,
                  details,
                  note.timestamp,
                  corp.corpName,
                  thumbnail
                ),
              ],
            },
            `Structure Notification: ${message}`
          );
        }
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${message}. Body: ${note.text}%n`,
      error
    );
  }
}

async function handleStructureNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  message: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);
    const structId = Number(values['structureID']) || 0;
    const thisStruct = corp.structures.find(
      (struct) => struct.structure_id === structId
    );

    const typeId =
      thisStruct?.type_id || values['structureTypeID'] || values['typeID'];
    const systemId =
      thisStruct?.system_id ||
      values['solarsystemID'] ||
      values['solarSystemID'];
    let structureName = thisStruct?.name;

    let dotLanLink = `Unknown System`;
    if (systemId) {
      const systemName = await getSystemName(systemId);
      dotLanLink = `[${systemName}](${DOTLAN_MAP_URL}${systemName.replaceAll(' ', '_')})`;
      structureName =
        structureName?.replace(systemName + ' - ', '').trim() || structureName;
    }

    if (structureName) {
      structureName = ` called '${structureName}'`;
    } else {
      structureName = '';
    }

    if (!typeId || !systemId) {
      consoleLog(
        `Missing typeId or systemId for structure notification. Values: ${JSON.stringify(values)}`
      );
    }

    let messageDetail = `What: ${await getItemName(typeId)}${structureName}
Where: ${dotLanLink} (${await getRegionNameFromSystemId(systemId)})`;

    if (values['timestamp'] && values['vulnerableTime']) {
      const jsTimestamp = filetimeToJsTimestamp(values['timestamp']); // 1764937640000 (ms since 1970)
      messageDetail +=
        '\n\nThe structure will exit reinforcement ' +
        getRelativeDiscordTime(new Date(jsTimestamp));
    } else if (values['timeLeft']) {
      const currentTime = isoToFiletime(note.timestamp);
      const endTime = currentTime + BigInt(values['timeLeft']);
      messageDetail += `\n\nAction will be complete ${getRelativeDiscordTime(new Date(filetimeToJsTimestamp(endTime)))}`;
    }

    messageDetail += await generateStructureAggressorStatement(values);
    messageDetail += generateDefenceLevelsStatement(values, 1); // Structure notifications give shield/armor/hull values as 0-1

    const thumbnail = `https://images.evetech.net/types/${typeId}/render?size=64`;

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);

        if (
          (structureStateMessage && thisChannel.structureStatus) ||
          (structureFuelMessage && thisChannel.structureFuel) ||
          (miningUpdatesMessage && thisChannel.miningUpdates)
        ) {
          let content;
          const role = role_to_mention(thisChannel);
          if (role) {
            content = `<@&${role}>`;
          }

          await sendMessage(
            channel,
            {
              content,
              embeds: [
                generateGeneralNotificationEmbed(
                  colour,
                  message,
                  messageDetail,
                  note.timestamp,
                  corp.corpName,
                  thumbnail
                ),
              ],
            },
            `Structure Notification: ${message}`
          );
        }
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${message}. Body: ${note.text}%n`,
      error
    );
  }
}

async function handleMoonMiningNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  message: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);

    // Ores by volume is sent in the notification text as a string like "\n  16264: 5000\n  16265: 10000\n"
    // filter values by those with keys that start with two spaces followed by only digits
    const oresByVolume = await Promise.all(
      Object.entries(values)
        .filter(([key, value]) => {
          consoleLog('Checking key', key);
          return /^\d+$/.test(key);
        })
        .map(async ([key, value]) => {
          const typeName = await getItemName(key.trim());
          const volume = Number.parseFloat(value.trim());
          return { typeName, volume };
        })
    );

    const structId = Number(values['structureID']) || 0;
    const thisStruct = corp.structures.find(
      (struct) => struct.structure_id === structId
    );

    const typeId =
      thisStruct?.type_id || values['structureTypeID'] || values['typeID'];
    const systemId =
      thisStruct?.system_id ||
      values['solarsystemID'] ||
      values['solarSystemID'];
    const regionName = await getRegionNameFromSystemId(systemId);
    let structureName = thisStruct?.name;

    let moonName = await getMoonName(values['moonID']);

    let dotLanLink = `Unknown System`;
    if (systemId) {
      const systemName = await getSystemName(systemId);
      dotLanLink = `[${systemName}](${DOTLAN_MAP_URL}${systemName.replaceAll(' ', '_')})`;
      structureName =
        structureName?.replace(systemName + ' - ', '').trim() || structureName;
      moonName = moonName.replace(systemName, '').trim();
    }

    if (structureName) {
      structureName = ` called '${structureName}'`;
    } else {
      structureName = '';
    }

    if (!typeId || !systemId) {
      consoleLog(
        `Missing typeId or systemId for structure notification. Values: ${JSON.stringify(values)}`
      );
    }

    let messageDetail = `What: The moon drill on the ${await getItemName(typeId)}${structureName}
Where: Planet ${moonName} in ${dotLanLink} (${regionName})`;

    if (values['autoTime']) {
      const autoTime = filetimeToJsTimestamp(values['autoTime']);
      messageDetail += `\nThe chunk will automatically fracture ${getRelativeDiscordTime(new Date(autoTime))}`;
    }

    if (oresByVolume.length > 0) {
      messageDetail += `\n\nEstimated chunk composition:\n${oresByVolume
        .map((ore) => `- ${ore.typeName}: ${formatOreVolume(ore.volume)}`)
        .join('\n')}`;
    }

    const thumbnail = `https://images.evetech.net/types/${typeId}/render?size=64`;

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);

        if (
          (structureStateMessage && thisChannel.structureStatus) ||
          (structureFuelMessage && thisChannel.structureFuel) ||
          (miningUpdatesMessage && thisChannel.miningUpdates)
        ) {
          let content;
          const role = role_to_mention(thisChannel);
          if (role) {
            content = `<@&${role}>`;
          }

          await sendMessage(
            channel,
            {
              content,
              embeds: [
                generateGeneralNotificationEmbed(
                  colour,
                  message,
                  messageDetail,
                  note.timestamp,
                  corp.corpName,
                  thumbnail
                ),
              ],
            },
            `Structure Notification: ${message}`
          );
        }
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${message}. Body: ${note.text}%n`,
      error
    );
  }
}

async function handleWarDeclaredNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  title: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);

    const declared_by_id = Number(values['declaredByID']) || 0;
    const declared_by_name = await getAllianceName(declared_by_id);

    const against_id = Number(values['againstID']) || 0;
    const against_name = await getAllianceName(against_id);

    const war_HQ = values['warHQ'] || 'Unknown Location';

    const title = 'War Declared';
    const war_message = `${declared_by_name} has declared war on ${against_name} with '${stripHtmlTags(war_HQ)}' as the designated war headquarters.`;
    const thumbnail = `https://images.evetech.net/alliances/${declared_by_id}/logo?size=64`;

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);

        let content;
        const role = role_to_mention(thisChannel);
        if (role) {
          content = `<@&${role}>`;
        }

        await sendMessage(
          channel,
          {
            content,
            embeds: [
              generateGeneralNotificationEmbed(
                colour,
                title,
                war_message,
                note.timestamp,
                corp.corpName,
                thumbnail
              ),
            ],
          },
          `War Notification: ${war_message}`
        );
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${title}. Body: ${note.text}%n`,
      error
    );
  }
}

async function handleTowerNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  message: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);

    const typeName = await getItemName(values['typeID']);
    const moonName = await getMoonName(values['moonID']);
    const systemName = await getSystemName(values['solarSystemID']);
    const regionName = await getRegionNameFromSystemId(values['solarSystemID']);

    let builtMessage = `What: ${typeName}
Where: Planet ${moonName.replace(systemName, '').trim()} in ${systemName} (${regionName})`;

    let fuelMessage = false;
    let statusMessage = false;

    const wantedTypeID = values['  typeID'];
    const wantedQuantity = Number(values['- quantity']);

    if (wantedQuantity && wantedTypeID) {
      // POS wants something
      const itemName = await getItemName(wantedTypeID); // spaces are required
      builtMessage += `\n${wantedQuantity} ${itemName}${
        wantedQuantity === 1 ? '' : 's'
      } remain${wantedQuantity === 1 ? 's' : ''}`;
      fuelMessage = true;
    }

    if (values['aggressorID']) {
      // POS under attack
      builtMessage += await generateTowerAggressorStatement(values);
      builtMessage += generateDefenceLevelsStatement(values, 100); // POS Tower gives percentages as 0-1
      statusMessage = true;
    }

    const thumbnail = `https://images.evetech.net/types/${values['typeID']}/render?size=64`;

    consoleLog('note', note);
    consoleLog('details', builtMessage);

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);

        if (
          (thisChannel.starbaseFuel && fuelMessage) ||
          (thisChannel.starbaseStatus && statusMessage)
        ) {
          let content;
          const role = role_to_mention(thisChannel);
          if (role) {
            content = `<@&${role}>`;
          }

          await sendMessage(
            channel,
            {
              content,
              embeds: [
                generateGeneralNotificationEmbed(
                  colour,
                  message,
                  builtMessage,
                  note.timestamp,
                  corp.corpName,
                  thumbnail
                ),
              ],
            },
            `Structure Notification: ${builtMessage}`
          );
        }
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${message}. Body: ${note.text}%n`,
      error
    );
  }
}

// Tower notifications give shield/armor/hull values as numbers between 0 and 1, so convert to percentage with 1 decimal place
// Structure notifications give shield/armor/hull values as numbers between 0 and 100, so convert to percentage with 1 decimal place
function formatPercentage(
  percentageString: string,
  multiplier: number
): string {
  const percentage = Number.parseFloat(percentageString);
  if (Number.isNaN(percentage)) {
    return percentageString; // Return original string if it's not a valid number
  }
  return `${Math.round(percentage * 10 * multiplier) / 10}%`;
}

async function generateStructureAggressorStatement(values: {
  [key: string]: string;
}) {
  const aggressor_id = Number(values['charID']) || 0;
  if (!aggressor_id) {
    return '';
  }
  const aggressorCharName = await getCharacterName(aggressor_id);
  const corpName = values['corpName'] || 'Unknown Corporation';
  const allianceName = values['allianceName'] || 'Unknown Alliance';

  return generateAggressorStatement(
    aggressor_id,
    aggressorCharName,
    corpName,
    allianceName
  );
}

async function generateTowerAggressorStatement(values: {
  [key: string]: string;
}) {
  const aggressor_id = Number(values['aggressorID']) || 0;
  if (!aggressor_id) {
    return '';
  }
  const aggressorCharName = await getCharacterName(aggressor_id);
  const corpName = await getCorpName(values['aggressorCorpID']);
  const allianceName = await getAllianceName(values['aggressorAllianceID']);

  return generateAggressorStatement(
    aggressor_id,
    aggressorCharName,
    corpName,
    allianceName
  );
}

async function generateAggressorStatement(
  aggressorID: string | number,
  aggressorCharName: string,
  corpName: string,
  allianceName: string
) {
  return `
  
Aggressor: [${aggressorCharName}](https://zkillboard.com/character/${aggressorID}/)
Corporation: [${corpName}](${dotLanCorpURL}${corpName.replaceAll(' ', '_')})
Alliance: [${allianceName}](${dotLanAllianceURL}${allianceName.replaceAll(' ', '_')})`;
}

function generateDefenceLevelsStatement(
  values: { [key: string]: string },
  multiplier: number
) {
  const shieldPercentage = values['shieldPercentage'] || values['shieldValue'];
  const armorPercentage = values['armorPercentage'] || values['armorValue'];
  const hullPercentage = values['hullPercentage'] || values['hullValue'];

  if (
    shieldPercentage != undefined &&
    armorPercentage != undefined &&
    hullPercentage != undefined
  ) {
    return `
    
Shield: ${formatPercentage(shieldPercentage, multiplier)} | Armor: ${formatPercentage(armorPercentage, multiplier)} | Hull: ${formatPercentage(hullPercentage, multiplier)}`;
  }
  return '';
}

function stripHtmlTags(war_HQ: string) {
  return war_HQ.replaceAll(/<[^>]*>/g, '');
}
function formatOreVolume(volume: number) {
  // format with commas as thousand separators with 0 decimal places, then add m³ at the end
  let displayVolume = Math.round(volume).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
  return `${displayVolume} m³`;
}

function filetimeToJsTimestamp(filetime: string | bigint): number {
  const filetimeBigInt = BigInt(filetime);
  return Number(filetimeBigInt / 10000n - 11644473600000n);
}

function isoToFiletime(isoString: string): bigint {
  // Parse ISO to JS timestamp (ms since 1970)
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid ISO timestamp');
  }

  const jsMs = BigInt(date.getTime());

  // Convert: ms → 100ns ticks, add FILETIME epoch offset
  return (jsMs + 11644473600000n) * 10000n;
}

// Handler for SovStructureReinforced notification
async function handleSovStructureReinforcedNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharacterNotificationsResponse[number],
  message: string,
  colour: number,
  role_to_mention: (c: DiscordChannel) => string | undefined,
  structureStateMessage: boolean,
  structureFuelMessage: boolean,
  miningUpdatesMessage: boolean
) {
  try {
    const values = parseNotificationText(note.text);
    const solarsystemID = Number(values['solarSystemID']) || 0;
    const systemName = await getSystemName(solarsystemID);
    const regionName = await getRegionNameFromSystemId(solarsystemID);
    let decloakTime = values['decloakTime'];
    let decloakTimeStr = '';
    if (decloakTime) {
      // decloakTime is a filetime (100ns since 1601-01-01 UTC)
      const decloakDate = new Date(filetimeToJsTimestamp(decloakTime));
      decloakTimeStr = `Command nodes will begin decloaking ${getRelativeDiscordTime(decloakDate)}`;
    }
    let dotLanLink = 'Unknown System';
    if (solarsystemID) {
      dotLanLink = `[${systemName}](${DOTLAN_MAP_URL}${systemName.replaceAll(' ', '_')})`;
    }
    let messageDetail = `The Sovereignty Hub in ${dotLanLink} (${regionName}) has been reinforced by hostile forces.\n${decloakTimeStr}`;

    const allianceId = values['sender_id'];
    const allianceName = await getAllianceName(allianceId);

    const thumbnail = `https://images.evetech.net/alliances/${allianceId}/logo?size=64`;

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        const thisChannel = data.channelFor(channel);
        if (structureStateMessage && thisChannel.structureStatus) {
          let content;
          const role = role_to_mention(thisChannel);
          if (role) {
            content = `<@&${role}>`;
          }
          await sendMessage(
            channel,
            {
              content,
              embeds: [
                generateGeneralNotificationEmbed(
                  colour,
                  message,
                  messageDetail,
                  note.timestamp,
                  allianceName,
                  thumbnail
                ),
              ],
            },
            `Sov Structure Notification: ${message}`
          );
        }
      }
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleSovStructureReinforcedNotification for ${message}. Body: ${note.text}%n`,
      error
    );
  }
}
