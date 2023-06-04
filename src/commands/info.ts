import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";
import { data } from "../Bot";
import { generateCorpDetailsEmbed } from "../EveSSO";

export const Info: Command = {
  name: "info",
  description: "Returns details of what is being tracked in this channel",
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Fetching info...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel?.isTextBased()) {
      let channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );

      for (const corp of channelCorps) {
        await channel.send({
          embeds: [generateCorpDetailsEmbed(corp)],
        });
      }
      if (channelCorps.length == 0) {
        await channel.send(
          "No data found for this channel.  Use /auth command to begin."
        );
      }
    }
  },
};
