import {
  Interaction,
  Client,
  CommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { Commands } from "../Commands";

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
  interaction: CommandInteraction
): Promise<void> => {
  const slashCommand = Commands.find((c) => c.name === interaction.commandName);
  if (!slashCommand) {
    interaction.reply({ content: "An error has occurred" });
    return;
  }

  await interaction.deferReply({ ephemeral: slashCommand.ephemeral });

  try {
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
