import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";

export const Hello: Command = {
  name: "hello",
  description: "Returns a greeting",
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Command received";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel && channel.isTextBased()) {
      channel.send(`Hello <@${interaction.user.id}>`);
    }
  },
};
