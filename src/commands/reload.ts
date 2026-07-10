import type { ChatInputCommandInteraction, Client } from 'discord.js';
import { SlashCommandStringOption } from 'discord.js';
import type { Command } from '../Command';

function createCommandOption(commandNames: string[] = []) {
  const option = new SlashCommandStringOption()
    .setName('command')
    .setDescription('The command to reload')
    .setRequired(true);

  if (commandNames.length > 0) {
    option.addChoices(
      ...commandNames.map((name) => ({
        name,
        value: name,
      }))
    );
  }

  return option;
}

let commandOption = createCommandOption();

export async function initialiseReloadCommandOptions() {
  const { Commands } = await import('../Commands.js');
  const commandNames = Commands.map((c) => c.name);
  commandOption = createCommandOption(commandNames);
  Reload.options = [commandOption];
}

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

    const { Commands } = await import('../Commands.js');
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

    await client.application.commands.create(sourceCommand);

    await interaction.editReply({
      content: `Reloaded command \`${commandName}\`.`,
    });
  },
};
