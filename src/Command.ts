import {
  ChatInputApplicationCommandData,
  Client,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from 'discord.js';

export interface Command extends ChatInputApplicationCommandData {
  ephemeral: boolean;
  deferReply: boolean;
  run: (
    client: Client,
    interaction: ChatInputCommandInteraction
  ) => Promise<void>;
  autocomplete?: (
    client: Client,
    interaction: AutocompleteInteraction
  ) => Promise<void>;
  button?: (client: Client, interaction: ButtonInteraction) => Promise<void>;
}
