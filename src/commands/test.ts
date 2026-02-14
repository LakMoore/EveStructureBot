import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { data, sendMessage } from "../Bot";
import { processNotifications } from "../notifications";
import { logError } from "../errorLogger";

export const Test: Command = {
  name: "test",
  description: "Parse the test notifications.json file",
  deferReply: true,
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Command received";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      await sendMessage(channel, `Testing...`, "Test");

      try {
        const fs = require("fs");
        const notifications = JSON.parse(
          fs.readFileSync("notifications.json", "utf8")
        );

        const corp = data.authenticatedCorps.findLast(
          (ac) => ac.corpId == 98691522
        );

        if (!corp) {
          await sendMessage(channel, `No data found for this channel.`, "No data found for this channel.");
          return;
        }

        await processNotifications(notifications, client, corp);
      } catch (error) {
        logError("Failed to process test notifications", error);
        await sendMessage(channel, `Failed to process test notifications.`, "Failed to process test notifications.");
      }
    }
  },
};
