import {
  CommandInteraction,
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../Command";
import { sso } from "../EveSSO";

const SCOPES_REQUIRED = [
  "esi-corporations.read_starbases.v1",
  "esi-corporations.read_structures.v1",
  "esi-corporations.read_corporation_membership.v1",
  "esi-characters.read_notifications.v1",
  "esi-characters.read_corporation_roles.v1",
];

export const Auth: Command = {
  name: "auth",
  description: "Get a link to authorise a character using Eve SSO",
  deferReply: true,
  ephemeral: true,
  run: async (client: Client, interaction: CommandInteraction) => {
    const channelId = interaction.channelId || "unknown";
    const userId = interaction.user.id;

    const state = `${channelId}|${userId}`;

    const login = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Log in using Eve Online Single Sign-On")
      .setURL(sso().getRedirectUrl(state, SCOPES_REQUIRED));

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(login);

    await interaction.followUp({ components: [row] });
  },
};
