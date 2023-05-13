import dotenv from "dotenv";
import { Client, EmbedBuilder, IntentsBitField } from "discord.js";
import ready from "./listeners/ready";
import interactionCreate from "./listeners/interactionCreate";
import { setup } from "./EveSSO";
import { Data, AuthenticatedCorp } from "./data/data";
import { GetCorporationsCorporationIdStructures200Ok } from "eve-client-ts";

export const data = new Data();
const LOW_FUEL_WARNING = 24 * 60 * 60 * 1000; //24 hours

async function main() {
  dotenv.config();
  consoleLog("Bot is starting...");

  await data.init();

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

main();

export function consoleLog(message?: any, ...optionalParams: any[]) {
  console.log(new Date().toISOString() + ": " + message, ...optionalParams);
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function checkForChangeAndPersist(
  client: Client<boolean>,
  corp: AuthenticatedCorp
) {
  let message = "";

  // find the user in our persisted storage
  const idx = data.authenticatedCorps.findIndex((thisCorp) => {
    return (
      thisCorp.channelId == corp.channelId && thisCorp.corpId == corp.corpId
    );
  });

  const channel = client.channels.cache.get(corp.channelId);
  if (channel && channel.isTextBased()) {
    if (idx > -1) {
      // seen this before, check each structure for changes.
      const oldCorp = data.authenticatedCorps[idx];

      // check for new structures
      const addedStructs = corp.structures.filter(
        (s1) =>
          !oldCorp.structures.some((s2) => s1.structure_id === s2.structure_id)
      );

      for (const s of addedStructs) {
        await channel.send({ embeds: [generateNewStructureEmbed(s)] });
      }

      // check for removed structures
      const removedStructs = oldCorp.structures.filter(
        (s1) =>
          !corp.structures.some((s2) => s1.structure_id === s2.structure_id)
      );

      // max embeds per message is 10
      for (const s of removedStructs) {
        await channel.send({
          embeds: [generateDeletedStructureEmbed(s)],
        });
      }

      const matchingStructs = corp.structures.filter((s1) =>
        oldCorp.structures.some((s2) => s1.structure_id === s2.structure_id)
      );
      for (const s of matchingStructs) {
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
              thisMessage += `\nStructure has a timer that ends ${getRelativeDiscordTime(
                s.state_timer_end
              )}`;
            } else {
              thisMessage += `\nStructure timer has reset`;
            }
          }
          // check for low fuel
          if (s.fuel_expires != undefined) {
            const expires = new Date(s.fuel_expires);
            if (expires < new Date(Date.now() + LOW_FUEL_WARNING)) {
              thisMessage += `\nWarning: Fuel will be depleated ${getRelativeDiscordTime(
                expires
              )}`;
            }
          }
          if (thisMessage.length > 0) {
            thisMessage = `ALERT on ${s.name}` + thisMessage;
          }
          if (thisMessage.length > 0) {
            message += thisMessage;
          }
        }
      }

      // replace the data in storage
      data.authenticatedCorps[idx] = corp;
    } else {
      // tracking new structures!

      // send individually to avoid max embed per message limit (10)
      for (const s of corp.structures) {
        await channel.send({ embeds: [generateNewStructureEmbed(s)] });
      }

      // add the data to storage
      data.authenticatedCorps.push(corp);
    }

    if (message.length > 0) {
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

const colours = {
  green: 0x00ff00,
  red: 0xff0000,
};

function generateNewStructureEmbed(
  s: GetCorporationsCorporationIdStructures200Ok
) {
  let fuelMessage = "Fuel has been depleated!";
  if (s.fuel_expires != undefined) {
    const expires = new Date(s.fuel_expires);
    if (expires > new Date()) {
      fuelMessage = `Fuel will be depleated ${getRelativeDiscordTime(expires)}`;
    }
  }
  let message = "";
  if (s.state_timer_end != undefined) {
    const ends = new Date(s.state_timer_end);
    message = `\nCurrent timer ends ${getRelativeDiscordTime(ends)}`;
  }

  const badgeUrl = `https://images.evetech.net/corporations/${s.corporation_id}/logo?size=64`;

  return new EmbedBuilder()
    .setColor(colours.green)
    .setAuthor({
      name: "New structure",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(s.name || "Unknown Structure")
    .setDescription(`Status: ${formatState(s.state)}\n${fuelMessage}` + message)
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

function generateDeletedStructureEmbed(
  s: GetCorporationsCorporationIdStructures200Ok
) {
  const badgeUrl = `https://images.evetech.net/corporations/${s.corporation_id}/logo?size=64`;

  return new EmbedBuilder()
    .setColor(colours.red)
    .setAuthor({
      name: "Deleted structure",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(s.name || "Unknown Structure")
    .setDescription("Structure is no longer part of the corporation!")
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

export function getRelativeDiscordTime(time: Date): string {
  return `<t:${new Date(time).getTime() / 1000}:R>`;
}
