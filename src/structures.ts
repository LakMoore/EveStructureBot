import { Client, EmbedBuilder, TextChannel } from "discord.js";
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
  sendMessage,
} from "./Bot";
import { getAccessToken, getWorkingChars } from "./EveSSO";
import { AuthenticatedCorp } from "./data/data";

export async function checkStructuresForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  consoleLog("checkStructuresForCorp ", corp.corpName);

  const workingChars = getWorkingChars(
    corp,
    corp.nextStructureCheck,
    (c) => c.nextStructureCheck,
    GetCharactersCharacterIdRolesOk.RolesEnum.StationManager
  );

  if (!workingChars || workingChars.length == 0) {
    consoleLog("No available characters to check structures with!");
    return;
  }

  const thisChar = workingChars[0];

  if (!thisChar || new Date(thisChar.nextStructureCheck) > new Date()) {
    consoleLog(thisChar.characterName + " is not ready to check structures!");
    return;
  }

  const config = await getAccessToken(thisChar);
  if (!config) {
    consoleLog("No access token for character " + thisChar.characterName);
    return;
  }

  consoleLog("Using " + thisChar.characterName);

  const structures = await CorporationApiFactory(
    config
  ).getCorporationsCorporationIdStructures(corp.corpId);

  const nextCheck = Date.now() + (STRUCTURE_CHECK_DELAY / workingChars.length) + 3000;
  thisChar.nextStructureCheck = new Date(nextCheck);

  //consoleLog("structs", structures);

  // make a new object so we can compare it to the old one
  const c: AuthenticatedCorp = {
    serverId: corp.serverId,
    channelId: undefined,
    channelIds: corp.channelIds,
    corpId: corp.corpId,
    corpName: corp.corpName,
    members: corp.members,
    characters: undefined,
    starbases: corp.starbases,
    structures: structures,
    nextStarbaseCheck: corp.nextStarbaseCheck,
    nextStructureCheck: new Date(nextCheck),
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: corp.mostRecentNotification,
    setDiscordRoles: corp.setDiscordRoles,
  };

  // check for change
  await checkForStructureChangeAndPersist(client, c);
}

async function checkForStructureChangeAndPersist(
  client: Client<boolean>,
  corp: AuthenticatedCorp
) {

  // find the user in our persisted storage
  const idx = data.authenticatedCorps.findIndex((thisCorp) => {
    return (
      thisCorp.serverId == corp.serverId && thisCorp.corpId == corp.corpId
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

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        var channelConfig = data.channelFor(channel);
        let message = "";
        let fuelMessage = false;
        let statusMessage = false;

        if (channelConfig.structureStatus) {
          for (const s of addedStructs) {
            await sendMessage(
              channel,
              { embeds: [generateNewStructureEmbed(s)] },
              "new structure"
            );
          }
        }


        // check for removed structures
        const removedStructs = oldCorp.structures.filter(
          (s1) =>
            !corp.structures.some((s2) => s1.structure_id === s2.structure_id)
        );

        if (channelConfig.structureStatus) {
          // max embeds per message is 10
          for (const s of removedStructs) {
            await sendMessage(
              channel,
              {
                embeds: [generateDeletedStructureEmbed(s)],
              },
              "deleted structure"
            );
          }
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
              statusMessage = true;
            }
            if (s.state_timer_end !== oldStruct.state_timer_end) {
              if (s.state_timer_end) {
                thisMessage += `\nStructure has a timer that ends ${getRelativeDiscordTime(
                  s.state_timer_end
                )}`;
              } else {
                thisMessage += `\nStructure timer has reset`;
              }
              statusMessage = true;
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
              fuelMessage = true;
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
                fuelMessage = true;
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
                fuelMessage = true;
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

        if (
          message.length > 0
          && (
            (channelConfig.structureStatus && statusMessage)
            || (channelConfig.structureFuel && fuelMessage)
          )
        ) {
          await sendMessage(channel, message, "structures: " + message);
        }
      }
    }

    // replace the data in storage
    data.authenticatedCorps[idx] = corp;
  } else {
    // tracking new structures!

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        var channelConfig = data.channelFor(channel);

        if (channelConfig.structureStatus) {
          // send individually to avoid max embed per message limit (10)
          for (const s of corp.structures) {
            await sendMessage(
              channel,
              { embeds: [generateNewStructureEmbed(s)] },
              "new structure"
            );
          }
        }
      }
    }

    // add the data to storage
    data.authenticatedCorps.push(corp);
  }

  await data.save();
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
      return "shield depleated";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.ArmorVulnerable:
      return "partial shields";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.HullReinforce:
      return "armor depleated";
    case GetCorporationsCorporationIdStructures200Ok.StateEnum.HullVulnerable:
      return "partial armor";
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
