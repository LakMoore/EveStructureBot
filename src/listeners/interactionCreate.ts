import {
  Interaction,
  Client,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  TextChannel,
  ButtonInteraction,
} from 'discord.js';
import { Commands } from '../Commands';
import { checkBotHasPermissions } from '../Bot';
import { LOGGER } from '../Logger';

export default (client: Client): void => {
  client.on(
    'interactionCreate',
    async (interaction: Interaction) => {
      if (interaction.isCommand() || interaction.isContextMenuCommand()) {
        await handleSlashCommand(client, interaction);
      }
      else if (interaction.isAutocomplete()) {
        await handleAutocomplete(client, interaction);
      }
      else if (interaction.isButton()) {
        await handleButton(client, interaction);
      }
    }
  );
};

const handleSlashCommand = async (
  client: Client,
  interaction: Interaction
): Promise<void> => {
  if (interaction instanceof ChatInputCommandInteraction) {
    const slashCommand = Commands.find(
      (c) => c.name === interaction.commandName
    );
    if (!slashCommand) {
      LOGGER.error('Slash command not found: ' + interaction.commandName);
      interaction.reply({ content: 'An error has occurred' });
      return;
    }

    if (slashCommand.deferReply) {
      await interaction.deferReply({ ephemeral: slashCommand.ephemeral });
    }

    try {
      const channel = interaction.channel as TextChannel;

      LOGGER.info(
        `${slashCommand.name} command issued on ${channel.name} in ${channel.guild?.name}`
      );

      if (!(await checkBotHasPermissions(interaction))) {
        return;
      }

      await slashCommand.run(client, interaction);
    }
    catch (error) {
      if (error instanceof Error) {
        await interaction.followUp({
          content: 'An error has occurred (' + error.message + ')',
        });
      }
      else {
        await interaction.followUp({
          content: 'An unknown error has occurred.',
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
  }
  catch (error) {
    if (error instanceof Error) {
      LOGGER.error('Autocomplete error: ' + error.message);
    }
    else {
      LOGGER.error('Autocomplete error: ' + String(error));
    }
  }
};

const handleButton = async (
  client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const buttonCommand = Commands.find(
    (c) => c.name === interaction.customId.split('_')[0]
  );

  try {
    if (buttonCommand?.button) {
      await buttonCommand.button(client, interaction);
    }
  }
  catch (error) {
    if (error instanceof Error) {
      LOGGER.error('Button error: ' + error.message);
    }
    else {
      LOGGER.error('Button error: ' + String(error));
    }
  }
};
