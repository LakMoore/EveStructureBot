import {
  CommandInteraction,
  Client,
  AutocompleteInteraction,
  SlashCommandStringOption,
  TextChannel,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../Command";
import { consoleLog, data, sendMessage } from "../Bot";
import { generateStructureNotificationEmbed } from "../embeds/structureNotification";

const stationNameOption = new SlashCommandStringOption()
  .setName("name")
  .setDescription("Name of Structure")
  .setRequired(true)
  .setAutocomplete(true);

export const Fuel: Command = {
  name: "fuel",
  description: "Fetch fuel status for a station.",
  deferReply: true,
  ephemeral: false,
  options: [stationNameOption],
  autocomplete: async (
    client: Client,
    interaction: AutocompleteInteraction,
  ) => {
    const focusedValue = interaction.options.getFocused();

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel?.isTextBased()) {
      const channelCorps = data.authenticatedCorps.filter((ac) =>
        ac.channelIds.includes(channel.id),
      );

      const choices = channelCorps
        .flatMap((corp) => {
          return corp.structures.map((struct) => {
            return {
              name: struct.name ?? "unknown structure",
              value: struct.structure_id.toString(),
            };
          });
        })
        .filter(
          (struct) =>
            focusedValue.length == 0 ||
            struct.name
              ?.toLocaleLowerCase()
              .includes(focusedValue.toLocaleLowerCase()),
        )
        .slice(0, 25);

      await interaction.respond(choices);
    }
  },
  run: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const content = "Fetching fuel info...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      const channelCorps = data.authenticatedCorps.filter((ac) =>
        ac.channelIds.includes(channel.id),
      );

      const result = channelCorps
        .flatMap((corp) => {
          return corp.structures.map((struct) => {
            return { struct, corp };
          });
        })
        .find(
          (v) =>
            v.struct.structure_id == interaction.options.get("name")?.value,
        );

      if (result?.struct.fuel_expires) {
        let text = "Fuel expires";
        if (new Date(result.struct.fuel_expires) < new Date()) {
          text = "Fuel expired";
        }
        await sendMessage(
          channel,
          {
            embeds: [
              generateStructureNotificationEmbed(
                0x00ff00,
                text,
                result.struct.fuel_expires,
                result.struct,
                result.corp.corpName,
              ),
            ],
          },
          "Fuel expired",
        );
      } else {
        await interaction.followUp(
          `No structure found with the name ${
            interaction.options.get("name")?.value
          }`,
        );
      }

      if (channelCorps.length == 0) {
        await sendMessage(
          channel,
          "No data found for this channel.  Use /auth command to begin.",
          "No data found for this channel.  Use /auth command to begin.",
        );
      }
    }
  },
};
