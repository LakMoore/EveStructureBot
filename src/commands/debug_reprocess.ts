import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandStringOption,
} from "discord.js";
import { Command } from "../Command";
import { data } from "../Bot";

const reprocessOption = new SlashCommandStringOption()
  .setName("duration")
  .setDescription("How far back to reprocess old notifications")
  .setRequired(true)
  .addChoices(
    { name: "all", value: "all" },
    { name: "one-week", value: "week" }
  );

export const DebugReprocess: Command = {
  name: "debug_reprocess",
  description: "Reprocess all the notifications (debug command).",
  deferReply: true,
  ephemeral: false,
  options: [reprocessOption],
  run: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const channel = client.channels.cache.get(interaction.channelId);

    let response = "Something went wrong!";

    if (channel?.isTextBased()) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelIds.includes(channel.id)
      );

      let newDate = new Date(0);
      if (interaction.options.get("duration")?.value == "week") {
        newDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      for (const corp of channelCorps) {
        corp.mostRecentNotification = newDate;
      }

      await data.save();
      response = "Notifications will be re-processed on next poll.";
    }
    await interaction.followUp({ content: response });
  },
};
