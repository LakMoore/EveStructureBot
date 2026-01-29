import { Client, EmbedBuilder, HTTPError, TextChannel } from "discord.js";
import {
  GetCharactersCharacterIdRolesOk,
  CorporationApiFactory,
  GetCorporationsCorporationIdStarbases200Ok,
  UniverseApiFactory,
  CharacterApiFactory,
  AllianceApiFactory,
} from "eve-client-ts";
import {
  colours,
  consoleLog,
  data,
  getRelativeDiscordTime,
  sendMessage,
  STRUCTURE_CHECK_DELAY,
} from "./Bot";
import { AuthenticatedCorp } from "./data/data";
import { getWorkingChars, getAccessToken } from "./EveSSO";

export async function checkStarbasesForCorp(
  corp: AuthenticatedCorp,
  client: Client,
) {
  consoleLog("checkStarbasesForCorp ", corp.corpName);

  const workingChars = getWorkingChars(
    corp,
    corp.nextStarbaseCheck,
    (c) => c.nextStarbaseCheck,
    GetCharactersCharacterIdRolesOk.RolesEnum.Director,
  );

  if (!workingChars || workingChars.length == 0) {
    consoleLog("No available characters to check starbases with!");
    return;
  }

  const thisChar = workingChars[0];

  if (!thisChar || new Date(thisChar.nextStarbaseCheck) > new Date()) {
    consoleLog(thisChar.characterName + " is not ready to check starbases!");
    return;
  }

  const config = await getAccessToken(thisChar);
  if (!config) {
    consoleLog("No access token for character " + thisChar.characterName);
    return;
  }

  consoleLog("Using " + thisChar.characterName);

  try {
    const starbases = await CorporationApiFactory(
      config,
    ).getCorporationsCorporationIdStarbases(corp.corpId);

    const nextCheck =
      Date.now() + STRUCTURE_CHECK_DELAY / workingChars.length + 3000;
    thisChar.nextStarbaseCheck = new Date(nextCheck);

    // make a new object so we can compare it to the old one
    const c: AuthenticatedCorp = {
      serverId: corp.serverId,
      serverName: corp.serverName,
      channelId: undefined,
      channelIds: corp.channelIds,
      corpId: corp.corpId,
      corpName: corp.corpName,
      members: corp.members,
      characters: undefined,
      starbases: starbases,
      structures: corp.structures,
      nextStarbaseCheck: new Date(nextCheck),
      nextStructureCheck: corp.nextStructureCheck,
      nextNotificationCheck: corp.nextNotificationCheck,
      mostRecentNotification: corp.mostRecentNotification,
      setDiscordRoles: corp.setDiscordRoles,
      addedAt: corp.addedAt,
      maxCharacters: corp.maxCharacters,
      maxDirectors: corp.maxDirectors,
      mostRecentAuthAt: corp.mostRecentAuthAt,
    };

    // check for change
    await checkForStarbaseChangeAndPersist(client, c);
  } catch (error: any) {
    // if 401 Unauthorized then mark this character as needing reauth
    if (error.status === 401) {
      thisChar.needsReAuth = true;
      thisChar.authFailedAt = new Date();
      await data.save();
      consoleLog(
        "Unauthorised! Marked " +
          thisChar.characterName +
          " as needing reauth.",
      );
    } else {
      throw error;
    }
  }
}

async function checkForStarbaseChangeAndPersist(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
) {
  // find the user in our persisted storage
  const idx = data.authenticatedCorps.findIndex((thisCorp) => {
    return thisCorp.serverId == corp.serverId && thisCorp.corpId == corp.corpId;
  });

  if (idx > -1) {
    // seen this before, check each starbase for changes.
    const oldCorp = data.authenticatedCorps[idx];

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        var channelConfig = data.channelFor(channel);
        let message = "";
        let fuelMessage = false;
        let statusMessage = false;

        if (channelConfig.starbaseStatus) {
          // check for new starbase
          const addedStarbase = corp.starbases.filter(
            (s1) =>
              !oldCorp.starbases.some(
                (s2) => s1.starbase_id === s2.starbase_id,
              ),
          );

          for (const s of addedStarbase) {
            await sendMessage(
              channel,
              {
                embeds: [await generateNewStarbaseEmbed(s, corp)],
              },
              "added starbase",
            );
          }

          // check for removed starbases
          const removedStarbases = oldCorp.starbases.filter(
            (s1) =>
              !corp.starbases.some((s2) => s1.starbase_id === s2.starbase_id),
          );

          // max embeds per message is 10
          for (const s of removedStarbases) {
            await sendMessage(
              channel,
              {
                embeds: [await generateDeletedStarbasesEmbed(s, corp)],
              },
              "removed starbase",
            );
          }
        }

        const matchingStarbases = corp.starbases.filter((s1) =>
          oldCorp.starbases.some((s2) => s1.starbase_id === s2.starbase_id),
        );
        for (const s of matchingStarbases) {
          const oldStarbase = oldCorp.starbases.find(
            (o) => o.starbase_id === s.starbase_id,
          );
          if (oldStarbase) {
            let thisMessage = "";
            // check for starbase status changes
            if (s.state != oldStarbase?.state) {
              thisMessage += `\nStatus has changed from ${oldStarbase.state} to ${s.state}`;
            }
            if (s.reinforced_until !== oldStarbase.reinforced_until) {
              if (s.reinforced_until) {
                thisMessage += `\nStarbase has a reinforcement timer that ends ${getRelativeDiscordTime(
                  s.reinforced_until,
                )}`;
              } else {
                thisMessage += `\nStarbase reinforcement timer has reset`;
              }
            }
            if (s.unanchor_at !== oldStarbase.unanchor_at) {
              if (s.unanchor_at) {
                thisMessage += `\nStarbase has an unanchor timer that started ${getRelativeDiscordTime(
                  s.unanchor_at,
                )}`;
              } else {
                thisMessage += `\nStarbase unanchor timer has reset`;
              }
            }

            const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

            if (thisMessage.length > 0) {
              thisMessage = `ALERT on Starbase ${starbaseName}` + thisMessage;
            }

            if (thisMessage.length > 0) {
              message += thisMessage + "\n\n";
            }
          }
        }

        if (message.length > 0) {
          await sendMessage(channel, message, "Starbases");
        }
      }
    }

    // replace the data in storage
    data.authenticatedCorps[idx] = corp;
  } else {
    // tracking new starbases!

    for (const channelId of corp.channelIds) {
      const channel = client.channels.cache.get(channelId);
      if (channel instanceof TextChannel) {
        // send individually to avoid max embed per message limit (10)
        for (const s of corp.starbases) {
          await sendMessage(
            channel,
            {
              embeds: [await generateNewStarbaseEmbed(s, corp)],
            },
            "New Starbase",
          );
        }

        // add the data to storage
        data.authenticatedCorps.push(corp);
      }
    }
  }

  await data.save();
}

async function generateNewStarbaseEmbed(
  s: GetCorporationsCorporationIdStarbases200Ok,
  corp: AuthenticatedCorp,
) {
  let message = "";

  if (s.reinforced_until != undefined) {
    const ends = new Date(s.reinforced_until);
    message = `\nReinforcement timer ends ${getRelativeDiscordTime(ends)}`;
  }

  if (s.unanchor_at != undefined) {
    const started = new Date(s.unanchor_at);
    message = `\nUnanchoring started ${getRelativeDiscordTime(started)}`;
  }

  const badgeUrl = `https://images.evetech.net/corporations/${corp.corpId}/logo?size=64`;
  const starbaseType = await getStarbaseType(s.type_id);
  const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.green)
    .setAuthor({
      name: "New Starbase",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(starbaseName)
    .setDescription(`Type: ${starbaseType}\nStatus: ${s.state}${message}`)
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`,
    );
}

async function generateDeletedStarbasesEmbed(
  s: GetCorporationsCorporationIdStarbases200Ok,
  corp: AuthenticatedCorp,
) {
  const badgeUrl = `https://images.evetech.net/corporations/${corp.corpId}/logo?size=64`;

  const starbaseType = await getStarbaseType(s.type_id);
  const starbaseName = await getStarbaseName(s.system_id, s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.red)
    .setAuthor({
      name: "Deleted Starbase",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(starbaseName)
    .setDescription(
      `Type: ${starbaseType}\nStarbase is no longer part of the corporation!`,
    )
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`,
    );
}

async function getStarbaseType(type_id: number) {
  const result = await UniverseApiFactory().getUniverseTypesTypeId(type_id);
  if (result) {
    return result.name;
  }
  return "Unknown Type";
}

export async function getStarbaseName(system_id?: number, moon_id?: number) {
  const systemName = await getSystemName(system_id);
  const moonName = await getMoonName(moon_id);

  let nameText = moonName;
  if (!moonName.startsWith(systemName)) {
    nameText = systemName + " - " + moonName;
  }
  return nameText;
}

export async function getSystemName(system_id?: number) {
  if (system_id) {
    const result =
      await UniverseApiFactory().getUniverseSystemsSystemId(system_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown System";
}

export async function getItemName(type_id?: number) {
  if (type_id) {
    const result = await UniverseApiFactory().getUniverseTypesTypeId(type_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown Item";
}

async function getMoonName(moon_id?: number) {
  if (moon_id) {
    const result = await UniverseApiFactory().getUniverseMoonsMoonId(moon_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown Moon";
}

// Get Character name from ID
export async function getCharacterName(character_id?: number) {
  if (character_id) {
    const result =
      await CharacterApiFactory().getCharactersCharacterId(character_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown Character";
}

// Get Corp Name from ID
export async function getCorpName(corp_id?: number) {
  if (corp_id) {
    const result =
      await CorporationApiFactory().getCorporationsCorporationId(corp_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown Corporation";
}

// Get Alliance Name from ID
export async function getAllianceName(alliance_id?: number) {
  if (alliance_id) {
    const result =
      await AllianceApiFactory().getAlliancesAllianceId(alliance_id);
    if (result) {
      return result.name;
    }
  }
  return "Unknown Alliance";
}
