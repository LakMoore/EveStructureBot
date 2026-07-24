import dotenv from 'dotenv';
import type {
  CommandInteraction,
  MessageCreateOptions,
  MessagePayload,
} from 'discord.js';
import {
  Client,
  IntentsBitField,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import ready from './listeners/ready';
import interactionCreate from './listeners/interactionCreate';
import { LOGGER } from './Logger';
import { setup } from './EveSSO';
import { Data } from './data/data';
import { initNoOpNotifications, initNotifications } from './data/notification';

export const data = new Data();
export const LOW_FUEL_WARNING = 7 * 24 * 60 * 60 * 1000; //7 days
export const SUPER_LOW_FUEL_WARNING = 2 * 24 * 60 * 60 * 1000; //2 days
export const STRUCTURE_CHECK_DELAY = 1000 * 60 * 60; // 1 hour
export const NOTIFICATION_CHECK_DELAY = 1000 * 60 * 10; // 10 mins
export const GET_ROLES_DELAY = 1000 * 60 * 60 * 24; // 1 day

export const colours = {
  green: 0x00ff00,
  red: 0xff0000,
};

async function main() {
  try {
    dotenv.config();
    LOGGER.warning('Bot is starting...');

    await data.init();
    initNotifications();
    // add no-op notifications (ignored types)
    initNoOpNotifications();

    const client = new Client({
      intents: [IntentsBitField.Flags.Guilds],
    });

    // setup listeners
    const readyFunc = ready(client);
    const interactionCreateFunc = interactionCreate(client);

    // login
    await client.login(process.env.SECRET_TOKEN);

    LOGGER.warning('Logged in!');

    setup(client);

    await Promise.all([readyFunc, interactionCreateFunc]);
  }
  catch (error) {
    LOGGER.error(
      error instanceof Error
        ? new Error('Fatal error in main(): ' + error.message, { cause: error })
        : new Error('Fatal error in main(): ' + String(error))
    );
  }

  // Kill the save loop and wait for any in-flight save to complete. This is called when the bot is shutting down.
  await data.stopAutoSave();

  // ensure that the process exits.  PM2 will restart the bot if it exits with a non-zero code, so we want to exit with 1 to indicate an error.
  process.exit(1);
}

process.on(
  'unhandledRejection',
  (reason) => {
    LOGGER.error('Unhandled promise rejection: ' + reason);
  }
);

process.on(
  'uncaughtException',
  (err) => {
    LOGGER.error('Uncaught exception: ' + err);
  }
);

void main();

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getRelativeDiscordTime(time: string | Date): string {
  return `<t:${Math.round(new Date(time).getTime() / 1000)}:R>`;
}

export async function sendMessage(
  channel: TextChannel,
  message: string | MessagePayload | MessageCreateOptions,
  type: string
) {
  try {
    LOGGER.info(
      `sending "${type}" message to ${channel.name} in ${channel.guild.name}`
    );
    await channel.send(message);
  }
  catch (error) {
    LOGGER.error(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function checkBotHasPermissions(interaction: CommandInteraction) {
  //check whether the bot has permission to post in this channel
  const channel = interaction.channel;
  if (channel instanceof TextChannel) {
    const permissions = channel.permissionsFor(interaction.client.user);
    if (
      !permissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ])
    ) {
      await interaction.followUp({
        content:
          'Please grant me permission to post in this channel and try again.',
        ephemeral: true,
      });
      return false;
    }
    return true;
  }
}
