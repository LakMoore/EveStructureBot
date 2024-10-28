import {
  CommandInteraction,
  Client,
  AutocompleteInteraction,
  SlashCommandStringOption,
  TextChannel,
} from "discord.js";
import { Command } from "../Command";
import { consoleLog, data, sendMessage } from "../Bot";

const characterNameOption = new SlashCommandStringOption()
  .setName("name")
  .setDescription("Name of Character")
  .setRequired(true)
  .setAutocomplete(true);

export const WhoIs: Command = {
  name: "whois",
  description: "Find the discord user who owns a given character.",
  ephemeral: false,
  options: [characterNameOption],
  autocomplete: async (
    client: Client,
    interaction: AutocompleteInteraction
  ) => {
    const focusedValue = interaction.options.getFocused();

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel?.isTextBased()) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );

      const choices = channelCorps
        .flatMap((corp) => {
          return corp.members.flatMap((m) => {
            return m.characters
              .filter((char) => char.characterName && char.characterId)
              .map((char) => {
                return {
                  name: char.characterName,
                  value: char.characterId.toString(),
                };
              });
          });
        })
        .filter(
          (char) =>
            focusedValue.length == 0 ||
            char.name
              ?.toLocaleLowerCase()
              .includes(focusedValue.toLocaleLowerCase())
        );

      await interaction.respond(choices);
    }
  },
  run: async (client: Client, interaction: CommandInteraction) => {
    let content = "Fetching character info...";

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );

      if (channelCorps.length == 0) {
        content =
          "No data found for this channel.  Use /auth command to begin.";
      } else {
        const charId = Number(
          interaction.options.get("name")?.value?.toString()
        );

        if (charId) {
          const character = channelCorps
            .flatMap((corp) => {
              return corp.members.flatMap((m) => m.characters);
            })
            .find((char) => char.characterId == charId);

          if (character) {
            content = `${character.characterName} is <@${character.discordId}>`;
          }
        } else {
          content = "Character not found";
        }
      }
    }

    await interaction.followUp({
      content,
      allowedMentions: {},
    });
  },
};
