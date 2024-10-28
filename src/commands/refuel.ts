import {
  CommandInteraction,
  Client,
  AutocompleteInteraction,
  SlashCommandStringOption,
  TextChannel,
} from "discord.js";
import { Command } from "../Command";
import { consoleLog, data, getRelativeDiscordTime, sendMessage } from "../Bot";
import { getSystemName } from "../starbases";

const systemNameOption = new SlashCommandStringOption()
  .setName("system")
  .setDescription("Selected System")
  .setRequired(true)
  .setAutocomplete(true);

export const Refuel: Command = {
  name: "refuel",
  description: "Fetch fuel status for all stations in a system.",
  ephemeral: false,
  options: [systemNameOption],
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

      const systems = await Promise.all(
        channelCorps
          .flatMap((corp) => {
            return corp.structures.map((struct) => {
              return struct.system_id;
            });
          })
          // remove duplicates
          .filter((system, index, array) => array.indexOf(system) === index)
          .map(async (system_id) => {
            return {
              name: await getSystemName(system_id),
              value: system_id.toString(),
            };
          })
      );

      const choices = systems
        .filter(
          (system) =>
            focusedValue.length == 0 ||
            system.name
              ?.toLocaleLowerCase()
              .includes(focusedValue.toLocaleLowerCase())
        )
        .slice(0, 25);

      await interaction.respond(choices);
    }
  },
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Fetching fuel info...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);

    if (channel instanceof TextChannel) {
      const channelCorps = data.authenticatedCorps.filter(
        (ac) => ac.channelId == channel.id
      );

      const structures = channelCorps
        .flatMap((corp) => {
          return corp.structures.map((struct) => {
            return { struct, corp };
          });
        })
        .filter(
          (v) => v.struct.system_id == interaction.options.get("system")?.value
        )
        .sort((v1, v2) => {
          const d1 = new Date(v1.struct.fuel_expires ?? 0);
          const d2 = new Date(v2.struct.fuel_expires ?? 0);
          return d1.getTime() - d2.getTime();
        });

      const result = structures.map((v) => {
        const d = new Date(v.struct.fuel_expires ?? 0);
        if (d < new Date()) {
          return `${v.struct.name} fuel expired ${getRelativeDiscordTime(d)}!!`;
        } else {
          return `${v.struct.name} fuel expires ${getRelativeDiscordTime(d)}`;
        }
      });

      if (result.length > 0) {
        await sendMessage(channel, result.join("\n"), "System Fuel");
      } else {
        await interaction.followUp(
          `No structures found in ${interaction.options.get("name")?.value}`
        );
      }

      if (channelCorps.length == 0) {
        await sendMessage(
          channel,
          "No data found for this channel.  Use /auth command to begin.",
          "No data found for this channel.  Use /auth command to begin."
        );
      }
    }
  },
};
