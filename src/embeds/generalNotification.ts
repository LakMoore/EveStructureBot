import { EmbedBuilder } from 'discord.js';
import { getRelativeDiscordTime } from '../Bot';

export function generateGeneralNotificationEmbed(
  colour: number,
  title: string,
  message: string,
  timestamp: string,
  authorName: string,
  thumbnail?: string
) {
  const embed = new EmbedBuilder()
    .setColor(colour)
    .setTitle(title)
    .setDescription(`${message}\n${getRelativeDiscordTime(timestamp)}`)
    .setAuthor({ name: authorName });

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}
