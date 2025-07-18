import {
    Client,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    TextChannel,
} from "discord.js";
import { Command } from "../Command";
import { DiscordChannel } from "../data/data";
import { data } from "../Bot";

function getRows(channel: DiscordChannel): ActionRowBuilder<ButtonBuilder>[] {
    return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('configure_toggle_starbaseFuel')
                .setLabel(`POS Fuel Alerts: ${channel.starbaseFuel ? 'ON' : 'OFF'}`)
                .setStyle(channel.starbaseFuel ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('configure_toggle_starbaseStatus')
                .setLabel(`POS Status Alerts: ${channel.starbaseStatus ? 'ON' : 'OFF'}`)
                .setStyle(channel.starbaseStatus ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('configure_toggle_structureFuel')
                .setLabel(`Structure Fuel Alerts: ${channel.structureFuel ? 'ON' : 'OFF'}`)
                .setStyle(channel.structureFuel ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('configure_toggle_structureStatus')
                .setLabel(`Structure Status Alerts: ${channel.structureStatus ? 'ON' : 'OFF'}`)
                .setStyle(channel.structureStatus ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('configure_toggle_miningUpdates')
                .setLabel(`Mining Updates: ${channel.miningUpdates ? 'ON' : 'OFF'}`)
                .setStyle(channel.miningUpdates ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
    ];
}

export const Configure: Command = {
    name: "configure",
    description: "Configure the bot for this channel.",
    deferReply: false,
    ephemeral: false,
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        const channel = interaction.channel as TextChannel;
        const thisChannel = data.channelFor(channel);
        await interaction.reply({ content: 'Toggle features:', components: getRows(thisChannel), ephemeral: true });
    },
    button: async (client: Client, interaction: ButtonInteraction) => {
        const channel = interaction.channel as TextChannel;
        const thisChannel = data.channelFor(channel);
        const customId = interaction.customId;

        if (customId.startsWith('configure_toggle_')) {
            const feature = customId.split('_')[2] as 'starbaseFuel' | 'starbaseStatus' | 'structureFuel' | 'structureStatus';
            const enabled = !thisChannel[feature];
            thisChannel[feature] = enabled;
            await data.save();

            await interaction.update({
                content: `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`,
                components: getRows(thisChannel),
            });
        }
    },
};
