import {
  Client,
  SlashCommandStringOption,
  TextChannel,
  SlashCommandRoleOption,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command } from '../Command';
import { data } from '../Bot';

const roleOption = new SlashCommandRoleOption()
  .setName('role')
  .setDescription('Role to Ping')
  .setRequired(false);

const pingType = new SlashCommandStringOption()
  .setName('type')
  .setDescription('Type of alert')
  .setRequired(true)
  .addChoices(
    { name: 'Fuel', value: 'fuel' },
    { name: 'Attack', value: 'attack' }
  );

export const SetPing: Command = {
  name: 'set_ping',
  description: 'Set the roles to be pinged on a given alert type.',
  deferReply: true,
  ephemeral: false,
  options: [pingType, roleOption],
  run: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const content = 'Setting notification role...';

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);
    const role = interaction.options.get('role', false)?.value;
    const type = interaction.options.get('type', true).value;

    if (channel instanceof TextChannel) {
      let thisChannel = data.channelFor(channel);

      if (type == 'attack') {
        thisChannel.attack_alert_role = role?.toString();
      } else if (type == 'fuel') {
        thisChannel.low_fuel_role = role?.toString();
      }

      await data.save();

      if (role) {
        await interaction.followUp(`Pings for ${type} set to <@&${role}>`);
      } else {
        await interaction.followUp(`Pings for ${type} removed`);
      }
    }
  },
};
