import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { sendMessage } from "../Bot";

export const Hello: Command = {
  name: "hello",
  description: "Returns a greeting",
  deferReply: true,
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Command received";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      await sendMessage(channel, `Hello <@${interaction.user.id}>`, "Hello");
    }
  },
};
