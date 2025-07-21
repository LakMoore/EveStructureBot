import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { data, sendMessage } from "../Bot";

export const CheckAuth: Command = {
  name: "checkauth",
  description: "Lists chars that need reauthorisation and pings their owners",
  deferReply: true,
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Fetching info...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelIds.includes(channel.id)
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

      const emptyCorps = channelCorps.filter((ac) => ac.members.length == 0);
      for (const corp of emptyCorps) {
        await sendMessage(
          channel,
          `Deleting empty corporation from this channel.`,
          `Deleting empty corporation from this channel.`
        );

        // remove this corp from the array
        var index = data.authenticatedCorps.indexOf(corp);
        data.authenticatedCorps.splice(index, 1);
        await data.save();

        var index2 = channelCorps.indexOf(corp);
        channelCorps.splice(index2, 1);
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
