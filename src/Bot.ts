import dotenv from 'dotenv';
import {
  Client,
  CommandInteraction,
  IntentsBitField,
  MessageCreateOptions,
  MessagePayload,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import ready from './listeners/ready';
import interactionCreate from './listeners/interactionCreate';
import { setup } from './EveSSO';
import { Data } from './data/data';
import { initNotifications } from './data/notification';

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

const SENSITIVE_KEYS = new Set([
  'token',
  'authtoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'authorization',
  'decoded_access_token',
  'secret',
  'password',
]);

function redactSensitive(value: any, seen = new WeakSet<object>()): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[REDACTED_JWT]'
      );
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitive(value.message, seen),
      stack: redactSensitive(value.stack, seen),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  const out: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(nestedValue, seen);
    }
  }

  return out;
}

async function main() {
  try {
    dotenv.config();
    consoleLog('Bot is starting...');

    await data.init();
    initNotifications();

    const client = new Client({
      intents: [IntentsBitField.Flags.Guilds],
    });

    // setup listeners
    ready(client);
    interactionCreate(client);

    // login
    await client.login(process.env.SECRET_TOKEN);

    consoleLog('Logged in!');

    setup(client);
  } catch (error) {
    consoleLog(error);
  }
}

main();

export function consoleLog(message?: any, ...optionalParams: any[]) {
  const safeMessage = redactSensitive(message);
  const safeParams = optionalParams.map((value) => redactSensitive(value));
  console.log(new Date().toISOString() + ': ' + safeMessage, ...safeParams);
}

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
    consoleLog(
      `sending "${type}" message to ${channel.name} in ${channel.guild.name}`
    );
    await channel.send(message);
  } catch (error) {
    consoleLog('An error occured in sendMessage', error);
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
