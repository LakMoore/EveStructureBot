import { Client, EmbedBuilder } from "discord.js";
import {
  GetCharactersCharacterIdRolesOk,
  CorporationApiFactory,
  GetCorporationsCorporationIdStructures200Ok,
} from "eve-client-ts";
import {
  consoleLog,
  STRUCTURE_CHECK_DELAY,
  NOTIFICATION_CHECK_DELAY,
  data,
  getRelativeDiscordTime,
  LOW_FUEL_WARNING,
  SUPER_LOW_FUEL_WARNING,
  colours,
} from "./Bot";
import { getConfig } from "./EveSSO";
import { AuthenticatedCorp } from "./data/data";

export async function checkStructuresForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  consoleLog("checkStructuresForCorp ", corp.corpName);

  const result = await getConfig(
    Array.prototype.concat(corp.members.flatMap((m) => m.characters)),
    corp.nextStructureCheck,
    STRUCTURE_CHECK_DELAY,
    (c) => c.nextStructureCheck,
    (c, next) => (c.nextStructureCheck = next),
    "structures",
    GetCharactersCharacterIdRolesOk.RolesEnum.StationManager
  );

  if (!result || !result.config || !result.config.accessToken) {
    return;
  }

  const { config, workingChars, thisChar } = result;

  const structures = await CorporationApiFactory(
    config
  ).getCorporationsCorporationIdStructures(corp.corpId);

  //consoleLog("structs", structures);

  // make a new object so we can compare it to the old one
  const c: AuthenticatedCorp = {
    serverId: corp.serverId,
    channelId: corp.channelId,
    corpId: corp.corpId,
    corpName: corp.corpName,
    members: corp.members,
    characters: undefined,
    starbases: corp.starbases,
    structures: structures,
    nextStarbaseCheck: corp.nextStarbaseCheck,
    nextStructureCheck: new Date(
      Date.now() + STRUCTURE_CHECK_DELAY / workingChars.length + 10000
    ),
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: corp.mostRecentNotification,
  };

  // check for change
  await checkForStructureChangeAndPersist(client, c);
}

async function checkForStructureChangeAndPersist(
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
  if (channel?.isTextBased()) {
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
          // check for change of fuel (up or down!)
          if (oldStruct.fuel_expires != s.fuel_expires) {
            if (oldStruct.fuel_expires && s.fuel_expires) {
              thisMessage += `\nFuel level has changed. Was expiring ${getRelativeDiscordTime(
                oldStruct.fuel_expires
              )} now expiring ${getRelativeDiscordTime(s.fuel_expires)}`;
            } else if (oldStruct.fuel_expires) {
              thisMessage += `\nFuel level has changed. Was expiring ${getRelativeDiscordTime(
                oldStruct.fuel_expires
              )}. Now has "unknown expiry"`;
            } else if (s.fuel_expires) {
              thisMessage += `\nFuel level has changed from "unknown expiry". Now expiring ${getRelativeDiscordTime(
                s.fuel_expires
              )}`;
            }
          }

          // check for low fuel
          if (s.fuel_expires != undefined) {
            const expires = new Date(s.fuel_expires);

            const authedCharCount =
              Array.prototype
                .concat(corp.members.flatMap((m) => m.characters))
                .filter((c) => !c.needsReAuth).length ?? 1;

            if (
              // fuel expiry is within one check delay of the super low warning
              expires <= new Date(Date.now() + SUPER_LOW_FUEL_WARNING) &&
              expires >=
                new Date(
                  Date.now() +
                    SUPER_LOW_FUEL_WARNING -
                    1000 -
                    NOTIFICATION_CHECK_DELAY / authedCharCount
                )
            ) {
              thisMessage += `\n@hereURGENT: Fuel will be depleated very soon ${getRelativeDiscordTime(
                expires
              )}`;
            } else if (
              // fuel expiry is within one check delay of the low warning
              expires <= new Date(Date.now() + LOW_FUEL_WARNING) &&
              expires >=
                new Date(
                  Date.now() +
                    LOW_FUEL_WARNING -
                    1000 -
                    NOTIFICATION_CHECK_DELAY / authedCharCount
                )
            ) {
              thisMessage += `\nWarning: Fuel will be depleated ${getRelativeDiscordTime(
                expires
              )}`;
            }
          }
          if (thisMessage.length > 0) {
            thisMessage = `ALERT on ${s.name}` + thisMessage;
          }
          if (thisMessage.length > 0) {
            message += thisMessage + "\n\n";
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

    await data.save();
  }
}

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
    .setTitle(s.name ?? "Unknown Structure")
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
    .setTitle(s.name ?? "Unknown Structure")
    .setDescription("Structure is no longer part of the corporation!")
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
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
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.Anchoring:
      return "anchoring";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.Unanchored:
      return "unanchored";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.ShieldVulnerable:
      return "full shields";
    default:
      return "unknown";
  }
}
