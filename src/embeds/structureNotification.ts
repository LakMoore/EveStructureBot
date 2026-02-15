import { EmbedBuilder } from 'discord.js';
import { getRelativeDiscordTime, consoleLog } from '../Bot';
import { GetCorporationStructuresResponse } from '@localisprimary/esi';
import {
  getItemName,
  getRegionNameFromSystemId,
  getSystemName,
} from '../starbases';

export const DOTLAN_MAP_URL = 'https://evemaps.dotlan.net/system/';

export async function generateStructureNotificationEmbed(
  colour: number,
  message: string,
  timestamp: string,
  thisStruct: GetCorporationStructuresResponse[number] | undefined,
  corpName: string
) {
  let dotLanLink = `Unknown System`;
  if (thisStruct?.system_id) {
    const systemName = await getSystemName(thisStruct?.system_id);
    dotLanLink = `[${systemName}](${DOTLAN_MAP_URL}${systemName.replaceAll(' ', '_')})`;
  }

  const structure_details = `What: ${await getItemName(thisStruct?.type_id)} belonging to ${corpName}
Where: ${dotLanLink} (${await getRegionNameFromSystemId(thisStruct?.system_id)})\n`;

  const embed = new EmbedBuilder()
    .setColor(colour)
    .setDescription(
      `${message.replace('[[STRUCTURE_DETAILS]]', structure_details)}\n${getRelativeDiscordTime(timestamp)}`
    );
  if (thisStruct) {
    embed
      .setTitle(thisStruct.name ?? 'unknown structure')
      .setAuthor({ name: corpName })
      .setThumbnail(
        `https://images.evetech.net/types/${thisStruct.type_id}/render?size=64`
      );
  } else {
    consoleLog('Failed to find structure');
    embed.setTitle(`Not sure which one!`);
  }
  return embed;
}
