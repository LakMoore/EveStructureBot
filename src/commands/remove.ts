import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";
import { data } from "../Bot";

export const Remove: Command = {
  name: "remove",
  description: "Deletes all stored data for the Corporations in this channel",
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "All channel data deleted";

    await data.removeChannel(interaction.channelId);

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};
