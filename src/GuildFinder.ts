import { Client, TextChannel } from 'discord.js';
import { LOGGER, OUR_GUILD, ERROR_CHANNEL } from './Logger';

export default class GuildFinder {
  public static async findAndStoreErrorChannel(client: Client): Promise<void> {
    try {
      const guilds = await client.guilds.fetch();
      for (const [id] of guilds) {
        try {
          const guild = await client.guilds.fetch(id);
          if (guild.name === OUR_GUILD) {
            const channels = await guild.channels.fetch();
            for (const [, ch] of channels) {
              if (ch instanceof TextChannel && ch.name === ERROR_CHANNEL) {
                LOGGER.setErrorChannel(ch);
                return;
              }
            }
          }
        } catch {
          // ignore individual guild errors
          continue;
        }
      }
    } catch (err) {
      // fail silently; logger not yet configured for Discord channel
      // leave console logging only
      // eslint-disable-next-line no-console
      console.error('GuildFinder error', err);
    }
  }
}
