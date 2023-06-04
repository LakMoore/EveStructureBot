import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";
import { data } from "../Bot";

export const DebugReprocessAll: Command = {
  name: "debug_reprocess_all",
  description: "Reprocess all the notifications (debug command).",
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const channel = client.channels.cache.get(interaction.channelId);

    let response = "Something went wrong!";

    if (channel?.isTextBased()) {
      let channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );
      for (const corp of channelCorps) {
        corp.mostRecentNotification = new Date(0);
      }

      await data.save();
      response = "Notifications will be re-processed on next poll.";
    }
    await interaction.followUp({ content: response });
  },
};
