import dotenv from "dotenv";
import { Client, IntentsBitField } from "discord.js";
import ready from "./listeners/ready";
import interactionCreate from "./listeners/interactionCreate";
import { setup } from "./EveSSO";
import { Data, authenticatedCorp } from "./data/data";
import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";

export const data = new Data();
const LOW_FUEL_WARNING = 24 * 60 * 60 * 1000; //24 hours

async function main() {
  dotenv.config();
  console.log("Bot is starting...");

  await data.init();

  const client = new Client({
    intents: [IntentsBitField.Flags.Guilds],
  });

  // setup listeners
  ready(client);
  interactionCreate(client);

  // login
  client.login(process.env.SECRET_TOKEN);

  console.log("Logged in!");

  setup(client);
}

main();

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function checkForChangeAndPersist(
  client: Client<boolean>,
  corp: authenticatedCorp
) {
  let message = "";

  // find the user in our persisted storage
  const idx = data.authenticatedCorps.findIndex((thisCorp) => {
    return (
      thisCorp.channelId == corp.channelId && thisCorp.corpId == corp.corpId
    );
  });

  if (idx > -1) {
    // seen this before, check each structure for changes.
    const oldCorp = data.authenticatedCorps[idx];

    // check for new structures
    const addedStructs = corp.structures.filter(
      (s1) =>
        !oldCorp.structures.some((s2) => s1.structure_id === s2.structure_id)
    );
    addedStructs.forEach((s) => (message += generateNewStructureMessage(s)));

    // check for removed structures
    const removedStructs = oldCorp.structures.filter(
      (s1) => !corp.structures.some((s2) => s1.structure_id === s2.structure_id)
    );
    removedStructs.forEach(
      (s) => (message += generateDeletedStructureMessage(s))
    );

    const matchingStructs = corp.structures.filter((s1) =>
      oldCorp.structures.some((s2) => s1.structure_id === s2.structure_id)
    );
    matchingStructs.forEach((s) => {
      const oldStruct = oldCorp.structures.find(
        (o) => o.structure_id === s.structure_id
      );
      if (oldStruct) {
        let thisMessage = "";
        // check for structure status changes
        if (s.state != oldStruct?.state) {
          thisMessage += `\nStatus has changed from ${formatState(
            oldStruct.state
          )} to ${formatState(s.state)}`;
        }
        if (s.state_timer_end !== oldStruct.state_timer_end) {
          if (s.state_timer_end) {
            thisMessage += `\nStructure has a timer that ends <t:${
              new Date(s.state_timer_end).getTime() / 1000
            }:R>`;
          } else {
            thisMessage += `\nStructure timer has reset`;
          }
        }
        // check for low fuel
        if (s.fuel_expires != undefined) {
          const expires = new Date(s.fuel_expires);
          if (expires < new Date(Date.now() + LOW_FUEL_WARNING)) {
            thisMessage += `\nWarning: Fuel will be depleated <t:${Math.round(
              expires.getTime() / 1000
            )}:R>`;
          }
        }
        if (thisMessage.length > 0) {
          thisMessage = `ALERT on ${s.name}` + thisMessage;
        }
        if (thisMessage.length > 0) {
          message += thisMessage;
        }
      }
    });

    // replace the data in storage
    data.authenticatedCorps[idx] = corp;
  } else {
    // tracking new structures!

    corp.structures.forEach((s) => {
      message += generateNewStructureMessage(s);
    });

    // add the data to storage
    data.authenticatedCorps.push(corp);
  }

  if (message.length > 0) {
    const channel = client.channels.cache.get(corp.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(message);
    }
  }
}

// anchor_vulnerable, anchoring, armor_reinforce,
// armor_vulnerable, deploy_vulnerable, fitting_invulnerable,
// hull_reinforce, hull_vulnerable, online_deprecated,
// onlining_vulnerable, shield_vulnerable, unanchored, unknown
function formatState(
  state: GetCorporationsCorporationIdStructures200Ok.StateEnum
): string {
  switch (state) {
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.ArmorReinforce:
      return "shield under attack";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.ArmorVulnerable:
      return "shield depleated";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.HullReinforce:
      return "armor under attack";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.HullVulnerable:
      return "armor depleated";
    default:
      return "normal";
  }
}

function generateNewStructureMessage(
  s: GetCorporationsCorporationIdStructures200Ok
) {
  let fuelMessage = "Fuel has been depleated!";
  if (s.fuel_expires != undefined) {
    const expires = new Date(s.fuel_expires);
    if (expires > new Date()) {
      fuelMessage = `Fuel will be depleated <t:${Math.round(
        expires.getTime() / 1000
      )}:R>`;
    }
  }
  let message = "";
  if (s.state_timer_end != undefined) {
    const ends = new Date(s.state_timer_end);
    message = `\n\tStructure timer ends ${getRelativeDiscordTime(ends)}`;
  }
  return (
    `\nNow tracking a structure called ${s.name}\n\tStatus: ${formatState(
      s.state
    )}\n\t${fuelMessage}` + message
  );
}

function generateDeletedStructureMessage(
  s: GetCorporationsCorporationIdStructures200Ok
) {
  return `\nNo longer tracking the structure called ${s.name}`;
}

function getRelativeDiscordTime(time: Date): string {
  return `<t:${time.getTime() / 1000}:R>`;
}
