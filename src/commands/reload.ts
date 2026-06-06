import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandStringOption,
} from 'discord.js';
import { Command } from '../Command';
import { Commands } from '../Commands';

const commandOption = new SlashCommandStringOption()
  .setName('command')
  .setDescription('The command to reload')
  .setRequired(true)
  .addChoices(...Commands.map((c) => ({ name: c.name, value: c.name })));

export const Reload: Command = {
  name: 'reload',
  description: 'Forces the bot to reload the specified command',
  deferReply: true,
  ephemeral: true,
  options: [commandOption],
  run: async (client: Client, interaction: ChatInputCommandInteraction) => {
    await interaction.editReply({ content: 'Reloading command...' });

    if (!client.application) {
      await interaction.editReply({ content: 'Unable to access command API.' });
      return;
    }

    const commandName = interaction.options
      .getString('command', true)
      .toLowerCase();

    const sourceCommand = Commands.find((c) => c.name === commandName);
    if (!sourceCommand) {
      await interaction.editReply({
        content: `There is no local command with name \`${commandName}\`.`,
      });
      return;
    }

    const deployedCommands = await client.application.commands.fetch();
    const deployedCommand = deployedCommands.find(
      (c) => c.name === commandName
    );

    if (deployedCommand) {
      await client.application.commands.delete(deployedCommand.id);
    }

    const { run, autocomplete, button, deferReply, ephemeral, ...commandData } =
      sourceCommand;

    await client.application.commands.create(commandData);

    await interaction.editReply({
      content: `Reloaded command \`${commandName}\`.`,
    });
  },
};
