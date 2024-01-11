import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { data, sendMessage } from "../Bot";

export const CheckAuth: Command = {
  name: "checkauth",
  description: "Lists chars that need reauthorisation and pings their owners",
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Fetching info...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );

      let found = false;

      for (const corp of channelCorps) {
        for (const char of Array.prototype.concat(
          corp.members.flatMap((m) => m.characters)
        )) {
          if (char.needsReAuth) {
            await sendMessage(
              channel,
              `<@${char.discordId}> Please use /auth to re-authorise your character, named "${char.characterName}".`,
              `<@${char.discordId}> Please use /auth to re-authorise your character, named "${char.characterName}".`
            );
            found = true;
          }
        }
      }

      if (channelCorps.length == 0) {
        await sendMessage(
          channel,
          "No data found for this channel.  Use /auth command to begin.",
          "No data found for this channel.  Use /auth command to begin."
        );
      } else if (!found) {
        await sendMessage(
          channel,
          "All characters are currently authorised correctly.",
          "All characters are currently authorised correctly"
        );
      }
    }
  },
};
