import { Client, EmbedBuilder } from "discord.js";
import {
  GetCharactersCharacterIdRolesOk,
  CorporationApiFactory,
  GetCorporationsCorporationIdStarbases200Ok,
  UniverseApiFactory,
} from "eve-client-ts";
import {
  colours,
  consoleLog,
  data,
  getRelativeDiscordTime,
  STRUCTURE_CHECK_DELAY,
} from "./Bot";
import { AuthenticatedCorp } from "./data/data";
import { getConfig } from "./EveSSO";

export async function checkStarbasesForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  consoleLog("checkStarbasesForCorp ", corp.corpName);

  const result = await getConfig(
    Array.prototype.concat(corp.members.flatMap((m) => m.characters)),
    corp.nextStarbaseCheck,
    STRUCTURE_CHECK_DELAY,
    (c) => c.nextStarbaseCheck,
    (c, next) => (c.nextStarbaseCheck = next),
    "starbases",
    GetCharactersCharacterIdRolesOk.RolesEnum.Director
  );

  if (!result || !result.config || !result.config.accessToken) {
    return;
  }

  const { config, workingChars, thisChar } = result;

  const starbases = await CorporationApiFactory(
    config
  ).getCorporationsCorporationIdStarbases(corp.corpId);

  // make a new object so we can compare it to the old one
  const c: AuthenticatedCorp = {
    serverId: corp.serverId,
    channelId: corp.channelId,
    corpId: corp.corpId,
    corpName: corp.corpName,
    members: corp.members,
    characters: undefined,
    starbases: starbases,
    structures: corp.structures,
    nextStarbaseCheck: new Date(
      Date.now() + STRUCTURE_CHECK_DELAY / workingChars.length + 10000
    ),
    nextStructureCheck: corp.nextStructureCheck,
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: corp.mostRecentNotification,
  };

  // check for change
  await checkForStarbaseChangeAndPersist(client, c);
}

async function checkForStarbaseChangeAndPersist(
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
      // seen this before, check each starbase for changes.
      const oldCorp = data.authenticatedCorps[idx];

      // check for new starbase
      const addedStarbase = corp.starbases.filter(
        (s1) =>
          !oldCorp.starbases.some((s2) => s1.starbase_id === s2.starbase_id)
      );

      for (const s of addedStarbase) {
        await channel.send({
          embeds: [await generateNewStarbaseEmbed(s, corp)],
        });
      }

      // check for removed starbases
      const removedStarbases = oldCorp.starbases.filter(
        (s1) => !corp.starbases.some((s2) => s1.starbase_id === s2.starbase_id)
      );

      // max embeds per message is 10
      for (const s of removedStarbases) {
        await channel.send({
          embeds: [await generateDeletedStarbasesEmbed(s, corp)],
        });
      }

      const matchingStarbases = corp.starbases.filter((s1) =>
        oldCorp.starbases.some((s2) => s1.starbase_id === s2.starbase_id)
      );
      for (const s of matchingStarbases) {
        const oldStarbase = oldCorp.starbases.find(
          (o) => o.starbase_id === s.starbase_id
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
                s.reinforced_until
              )}`;
            } else {
              thisMessage += `\nStarbase reinforcement timer has reset`;
            }
          }
          if (s.unanchor_at !== oldStarbase.unanchor_at) {
            if (s.unanchor_at) {
              thisMessage += `\nStarbase has an unanchor timer that started ${getRelativeDiscordTime(
                s.unanchor_at
              )}`;
            } else {
              thisMessage += `\nStarbase unanchor timer has reset`;
            }
          }

          const systemName = await getSystemName(s.system_id);
          const moonName = await getMoonName(s.moon_id);

          if (thisMessage.length > 0) {
            thisMessage =
              `ALERT on Starbase location ${systemName} - ${moonName}` +
              thisMessage;
          }
          if (thisMessage.length > 0) {
            message += thisMessage + "\n\n";
          }
        }
      }

      // replace the data in storage
      data.authenticatedCorps[idx] = corp;
    } else {
      // tracking new starbases!

      // send individually to avoid max embed per message limit (10)
      for (const s of corp.starbases) {
        await channel.send({
          embeds: [await generateNewStarbaseEmbed(s, corp)],
        });
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

async function generateNewStarbaseEmbed(
  s: GetCorporationsCorporationIdStarbases200Ok,
  corp: AuthenticatedCorp
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
  const starbaseName = await getStarbaseName(s.type_id);
  const systemName = await getSystemName(s.system_id);
  const moonName = await getMoonName(s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.green)
    .setAuthor({
      name: "New Starbase",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(`${systemName} - ${moonName}`)
    .setDescription(`Type: ${starbaseName}\nStatus: ${s.state}${message}`)
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

async function generateDeletedStarbasesEmbed(
  s: GetCorporationsCorporationIdStarbases200Ok,
  corp: AuthenticatedCorp
) {
  const badgeUrl = `https://images.evetech.net/corporations/${corp.corpId}/logo?size=64`;

  const starbaseName = await getStarbaseName(s.type_id);
  const systemName = await getSystemName(s.system_id);
  const moonName = await getMoonName(s.moon_id);

  return new EmbedBuilder()
    .setColor(colours.red)
    .setAuthor({
      name: "Deleted Starbase",
      iconURL: badgeUrl,
      url: undefined,
    })
    .setTitle(`${systemName} - ${moonName}`)
    .setDescription(
      `Type: ${starbaseName}\nStarbase is no longer part of the corporation!`
    )
    .setThumbnail(
      `https://images.evetech.net/types/${s.type_id}/render?size=64`
    );
}

async function getStarbaseName(type_id: number) {
  const result = await UniverseApiFactory().getUniverseTypesTypeId(type_id);
  if (result) {
    return result.name;
  }
  return "Unknown Type";
}

async function getSystemName(system_id: number) {
  const result = await UniverseApiFactory().getUniverseSystemsSystemId(
    system_id
  );
  if (result) {
    return result.name;
  }
  return "Unknown System";
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
