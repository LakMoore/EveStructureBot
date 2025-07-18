import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { data, sendMessage } from "../Bot";
import { generateCorpDetailsEmbed } from "../embeds/corpDetails";

export const Info: Command = {
  name: "info",
  description: "Returns details of what is being tracked in this channel",
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
        (ac) => ac.channelId == channel.id
      );

      for (const corp of channelCorps) {
        await sendMessage(
          channel,
          {
            embeds: [generateCorpDetailsEmbed(corp)],
          },
          "Corp Details"
        );
      }
      if (channelCorps.length == 0) {
        await sendMessage(
          channel,
          "No data found for this channel.  Use /auth command to begin.",
          "No data found for this channel.  Use /auth command to begin."
        );
      }
    }
  },
};
