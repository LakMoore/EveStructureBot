import dotenv from "dotenv";
import { Client, IntentsBitField } from "discord.js";
import ready from "./listeners/ready";
import interactionCreate from "./listeners/interactionCreate";
import { setup } from "./EveSSO";
import { Data } from "./data/data";
import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";
import { initNotifications } from "./data/notification";

export const data = new Data();
export const LOW_FUEL_WARNING = 7 * 24 * 60 * 60 * 1000; //7 days
export const SUPER_LOW_FUEL_WARNING = 2 * 24 * 60 * 60 * 1000; //2 days
export const STRUCTURE_CHECK_DELAY = 1000 * 60 * 60; // 1 hour
export const NOTIFICATION_CHECK_DELAY = 1000 * 60 * 10; // 10 mins
export const NO_ROLE_DELAY = 1000 * 60 * 60 * 24; // 1 day

export const colours = {
  green: 0x00ff00,
  red: 0xff0000,
};

async function main() {
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
}

main().catch((err) => {
  consoleLog(err);
});

export function consoleLog(message?: any, ...optionalParams: any[]) {
  console.log(new Date().toISOString() + ": " + message, ...optionalParams);
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getRelativeDiscordTime(time: Date): string {
  return `<t:${Math.round(new Date(time).getTime() / 1000)}:R>`;
}
