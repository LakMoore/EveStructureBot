import { EmbedBuilder } from "discord.js";
import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";
import { getRelativeDiscordTime, consoleLog } from "../Bot";

export function generateStructureNotificationEmbed(
  colour: number,
  message: string,
  timestamp: Date,
  thisStruct: GetCorporationsCorporationIdStructures200Ok | undefined,
  corpName: string
) {
  const embed = new EmbedBuilder()
    .setColor(colour)
    .setDescription(`${message}\n${getRelativeDiscordTime(timestamp)}`);
  if (thisStruct) {
    embed
      .setTitle(thisStruct.name ?? "unknown structure")
      .setAuthor({ name: corpName })
      .setThumbnail(
        `https://images.evetech.net/types/${thisStruct.type_id}/render?size=64`
      );
  } else {
    consoleLog("Failed to find structure");
    embed.setTitle(`Not sure which one!`);
  }
  return embed;
}
