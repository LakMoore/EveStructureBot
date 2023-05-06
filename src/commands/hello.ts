import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";

export const Hello: Command = {
  name: "hello",
  description: "Returns a greeting",
  run: async (client: Client, interaction: CommandInteraction) => {
    // const content = "Hello there!";

    // await interaction.followUp({
    //   ephemeral: true,
    //   content,
    // });

    const channel = await client.channels.cache.get(interaction.channelId);

    if (channel && channel.isTextBased()) {
      channel.send(`Hello <@${interaction.user.id}>.`);
    }
  },
};
