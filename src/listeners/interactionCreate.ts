import {
  Interaction,
  Client,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  TextChannel,
} from "discord.js";
import { Commands } from "../Commands";
import { consoleLog } from "../Bot";

export default (client: Client): void => {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isCommand() || interaction.isContextMenuCommand()) {
      await handleSlashCommand(client, interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(client, interaction);
    }
  });
};

const handleSlashCommand = async (
  client: Client,
  interaction: Interaction
): Promise<void> => {
  if (interaction instanceof ChatInputCommandInteraction) {
    const slashCommand = Commands.find((c) => c.name === interaction.commandName);
    if (!slashCommand) {
      interaction.reply({ content: "An error has occurred" });
      return;
    }

    if (slashCommand.deferReply) {
      await interaction.deferReply({ ephemeral: slashCommand.ephemeral });
    }

    try {
      const channel = interaction.channel as TextChannel;

      consoleLog(
        `${slashCommand.name} command issued on ${channel.name} in ${channel.guild?.name}`
      );

      await slashCommand.run(client, interaction);
    } catch (error) {
      if (error instanceof Error) {
        await interaction.followUp({
          content: "An error has occurred (" + error.message + ")",
        });
      } else {
        await interaction.followUp({
          content: "An unknown error has occurred.",
        });
      }
    }
  }
};

const handleAutocomplete = async (
  client: Client,
  interaction: AutocompleteInteraction
): Promise<void> => {
  const slashCommand = Commands.find((c) => c.name === interaction.commandName);

  try {
    if (slashCommand?.autocomplete) {
      await slashCommand.autocomplete(client, interaction);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log("Autocomplete error: " + error.message);
    } else {
      console.log("Autocomplete error: " + error);
    }
  }
};
