import dotenv from "dotenv";
import {
  Client,
  IntentsBitField,
  MessageCreateOptions,
  MessagePayload,
  TextChannel,
} from "discord.js";
import ready from "./listeners/ready";
import interactionCreate from "./listeners/interactionCreate";
import { setup } from "./EveSSO";
import { Data } from "./data/data";
import { initNotifications } from "./data/notification";

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
    consoleLog("Bot is starting...");

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

    consoleLog("Logged in!");

    setup(client);

  } catch (error) {
    consoleLog(error);
  }
}

main();

export function consoleLog(message?: any, ...optionalParams: any[]) {
  console.log(new Date().toISOString() + ": " + message, ...optionalParams);
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getRelativeDiscordTime(time: Date): string {
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
    consoleLog("An error occured in sendMessage", error);
  }
}
