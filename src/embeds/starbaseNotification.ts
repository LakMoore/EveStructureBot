import { EmbedBuilder } from "discord.js";
import { getRelativeDiscordTime } from "../Bot";

export function generateStarbaseNotificationEmbed(
  colour: number,
  message: string,
  timestamp: Date,
  starbaseName: string,
  corpName: string,
  starbase_type_id?: number,
) {
  const embed = new EmbedBuilder()
    .setColor(colour)
    .setDescription(`${message}\n${getRelativeDiscordTime(timestamp)}`)
    .setTitle(starbaseName)
    .setAuthor({ name: corpName });

  if (starbase_type_id) {
    embed.setThumbnail(
      `https://images.evetech.net/types/${starbase_type_id}/render?size=64`,
    );
  }

  return embed;
}
