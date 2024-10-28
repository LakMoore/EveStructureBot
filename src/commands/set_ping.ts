import {
  CommandInteraction,
  Client,
  SlashCommandStringOption,
  TextChannel,
  SlashCommandRoleOption,
} from "discord.js";
import { Command } from "../Command";
import { data } from "../Bot";

const roleOption = new SlashCommandRoleOption()
  .setName("role")
  .setDescription("Role to Ping")
  .setRequired(true);

const pingType = new SlashCommandStringOption()
  .setName("type")
  .setDescription("Type of alert")
  .setRequired(true)
  .addChoices(
    { name: "Fuel", value: "fuel" },
    { name: "Attack", value: "attack" }
  );

export const SetPing: Command = {
  name: "set_ping",
  description: "Set the roles to be pinged on a given alert type.",
  ephemeral: false,
  options: [pingType, roleOption],
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Setting notification role...";

    await interaction.followUp({
      content,
    });

    const channel = client.channels.cache.get(interaction.channelId);
    const role = interaction.options.get("role", true).value;
    const type = interaction.options.get("type", true).value;

    if (channel instanceof TextChannel) {
      let thisChannel = data.channels.find((c) => c.channelId == channel.id);

      if (!thisChannel) {
        thisChannel = {
          serverId: channel.guild.id,
          channelId: channel.id,
          name: channel.name,
        };
        data.channels.push(thisChannel);
      }

      if (type == "attack") {
        thisChannel.attack_alert_role = role?.toString();
      } else if (type == "fuel") {
        thisChannel.low_fuel_role = role?.toString();
      }

      data.save();

      await interaction.followUp(`Pings for ${type} set to <@&${role}>`);
    }
  },
};
