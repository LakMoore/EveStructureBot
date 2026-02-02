import {
  CommandInteraction,
  Client,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Interaction,
} from 'discord.js';
import { Command } from '../Command';
import { data } from '../Bot';

const DELETE_DATA = 'ConfirmDelete';
const CANCEL_DELETE = 'CancelDelete';

export const Remove: Command = {
  name: 'remove',
  description: 'Deletes all stored data for the Corporations in this channel',
  deferReply: true,
  ephemeral: false,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content =
      'Are you sure you want to delete the data for this channel from EveStructureBot?';

    const confirm = new ButtonBuilder()
      .setCustomId(DELETE_DATA)
      .setStyle(ButtonStyle.Danger)
      .setLabel('DELETE ALL DATA');
    const cancel = new ButtonBuilder()
      .setCustomId(CANCEL_DELETE)
      .setStyle(ButtonStyle.Primary)
      .setLabel('Cancel and keep the data');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirm,
      cancel
    );

    const response = await interaction.followUp({
      content,
      components: [row],
    });

    const collectorFilter = (i: Interaction) =>
      i.user.id === interaction.user.id;

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: collectorFilter,
        time: 60000,
      });

      if (confirmation.customId === DELETE_DATA) {
        await data.removeChannel(interaction.channelId);
        await confirmation.update({
          content: 'All channel data deleted',
          components: [],
        });
      } else if (confirmation.customId === CANCEL_DELETE) {
        await confirmation.update({
          content: 'Action cancelled',
          components: [],
        });
      }
    } catch (e) {
      await interaction.editReply({
        content: 'Confirmation not received within 1 minute, cancelling',
        components: [],
      });
    }
  },
};
