import { CommandInteraction, Client, TextChannel } from "discord.js";
import { Command } from "../Command";
import { logInfo, logWarning, logError } from "../errorLogger";

export const TestErrorLogging: Command = {
  name: "test_error_logging",
  description: "Test the error logging system (sends test messages to error channel)",
  deferReply: true,
  ephemeral: true,
  run: async (client: Client, interaction: CommandInteraction) => {
    try {
      await interaction.followUp({
        content: "Testing error logging system... Check the error channel for messages.",
        ephemeral: true,
      });

      // Test info level
      logInfo("Test INFO message from test_error_logging command");

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test warning level
      logWarning("Test WARNING message from test_error_logging command");

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test error level (will ping @everyone)
      logError("Test ERROR message from test_error_logging command - this should ping @everyone");

      await interaction.editReply({
        content: "Test messages sent to error channel successfully! Check the error channel.",
      });
    } catch (error) {
      logError("Error in test_error_logging command", error);
      await interaction.editReply({
        content: "Failed to send test messages. Check console for errors.",
      });
    }
  },
};
