import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";
import { Commands } from "../Commands";

export const Reload: Command = {
  name: "reload",
  description: "Forces the bot to reload the specified command",
  ephemeral: true,
  run: async (client: Client, interaction: CommandInteraction) => {
    const content = "Reloading command...";

    await interaction.followUp({
      content,
    });

    if (client.application) {
      const commandName =
        interaction.options
          .get("command", true)
          .value?.toString()
          .toLocaleLowerCase() ?? "";
      const command = client.application?.commands.cache.get(commandName);

      if (!command) {
        await interaction.reply(
          `There is no command with name \`${commandName}\`!`
        );
        return;
      }

      const commands = await client.application.commands.fetch();

      for (const command of commands.values()) {
        await client.application?.commands.delete(command);
      }

      await client.application.commands.set(Commands);

      await interaction.reply("Commands reloaded");
      return;
    }
    await interaction.reply("Unknown error!");
  },
};
