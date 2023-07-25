import { Channel, Client, EmbedBuilder } from "discord.js";
import {
  CharacterApiFactory,
  Configuration,
  CorporationApiFactory,
  GetCharactersCharacterIdRolesOk,
} from "eve-client-ts";
import SingleSignOn, { HTTPFetchError } from "@after_ice/eve-sso";
import Koa from "koa";
import { AuthenticatedCharacter, AuthenticatedCorp } from "./data/data";
import { checkForChangeAndPersist, consoleLog, data } from "./Bot";
import { messageTypes } from "./data/notification";
//HTTPS shouldn't be needed if you are behind something like nginx
//import https from "https";

export let sso: SingleSignOn;
const STRUCTURE_CHECK_DELAY = 1000 * 60 * 60; // 1 hour
const NOTIFICATION_CHECK_DELAY = 1000 * 60 * 10; // 10 mins
const NO_ROLE_DELAY = 1000 * 60 * 60 * 24; // 1 day

export function setup(client: Client) {
  // Get the client ID and secret from the Eve developers section
  const CLIENT_ID = process.env.EVE_CLIENT_ID ?? "";
  const SECRET = process.env.EVE_SECRET_KEY ?? "";
  // The callback URI as defined in the application in the developers section
  const CALLBACK_URI = process.env.EVE_CALLBACK_URL ?? "";
  const CALLBACK_SERVER_PORT = Number(
    process.env.CALLBACK_SERVER_PORT ?? "8080"
  );

  sso = new SingleSignOn(CLIENT_ID, SECRET, CALLBACK_URI, {
    endpoint: "https://login.eveonline.com",
    userAgent: "eve-structure-bot",
  });

  const app = new Koa();

  // Handle the SSO callback (this route is the CALLBACK_URI above)
  app.use(async (ctx) => {
    // Get the one-time access code
    let code = ctx.query.code;
    let state = ctx.query.state;

    if (code && state) {
      if (Array.isArray(code)) {
        code = code[0];
      }
      if (Array.isArray(state)) {
        state = state[0];
      }

      const parts = state.split("|");
      const channelId = parts[0];
      const userId = parts[1];

      // Swap the one-time code for an access token
      const info = await sso.getAccessToken(code);

      // Usually you'd want to store the access token
      // as well as the refresh token
      consoleLog("info", info);

      const subParts = info.decoded_access_token.sub.split(":");
      const charId = Number(
        subParts.length > 0 ? subParts[subParts.length - 1] : "0"
      );

      // Do whatever, for example, redirect to user page
      ctx.response.body =
        "Authentication successful.  Please close this browser window and continue working with EveStructureBot in the Discord channel.";

      if (channelId && !Array.isArray(channelId) && channelId != "unknown") {
        const channel = client.channels.cache.get(channelId);

        if (channel?.isTextBased() && !channel.isDMBased()) {
          let errMessage = "";
          const expires = getExpires(info.expires_in);

          const char = await CharacterApiFactory().getCharactersCharacterId(
            charId
          );
          consoleLog("char", char);
          const corpId = char.corporation_id;
          if (!corpId) {
            errMessage +=
              "\nCharacter is not in a Corporation. Unable to proceed.";
          } else {
            const corp =
              await CorporationApiFactory().getCorporationsCorporationId(
                corpId
              );

            if (corp.name) {
              try {
                const config = new Configuration();
                config.accessToken = info.access_token;

                let thisCorp = data.authenticatedCorps.find(
                  (ac) => ac.channelId == channelId && ac.corpId == corpId
                );
                if (!thisCorp) {
                  thisCorp = {
                    channelId: channelId,
                    corpId: corpId,
                    corpName: corp.name,
                    members: [],
                    characters: undefined,
                    structures: [],
                    nextStructureCheck: new Date(),
                    nextNotificationCheck: new Date(),
                    mostRecentNotification: new Date(),
                  };
                  data.authenticatedCorps.push(thisCorp);
                }

                // make a new version of the character that just got authenticated
                const character: AuthenticatedCharacter = {
                  discordId: userId,
                  characterId: charId,
                  characterName: char.name,
                  corpId: char.corporation_id,
                  authToken: info.access_token,
                  tokenExpires: expires,
                  refreshToken: info.refresh_token,
                  nextStructureCheck: new Date(),
                  nextNotificationCheck: new Date(),
                  needsReAuth: false,
                };

                // search for the Corp member
                const memberIdx = thisCorp.members.findIndex(
                  (corpMember) => corpMember.discordId === userId
                );

                if (memberIdx > -1) {
                  // if the member is already known
                  const corpMember = thisCorp.members[memberIdx];
                  // search the member for the character
                  const idx = corpMember.characters.findIndex(
                    (ch) => ch.characterId == charId
                  );

                  if (idx > -1) {
                    // if the character is already known, overwrite
                    corpMember.characters[idx] = character;
                  } else {
                    // if the character is new, add it
                    corpMember.characters.push(character);
                  }
                } else {
                  // if the member is new, add it with this initial character
                  thisCorp.members.push({
                    discordId: userId,
                    characters: [character],
                  });
                }

                await channel.send(`Successfully authenticated ${char.name}`);

                await channel.send({
                  embeds: [generateCorpDetailsEmbed(thisCorp)],
                });

                await data.save();

                const member = thisCorp.members.find(
                  (m) => m.discordId === userId
                );

                if (member) {
                  // use tickers to set Discord Roles
                  await setDiscordRoles(channel, userId, member.characters);
                }
              } catch (error) {
                consoleLog("error", error);
                if (error instanceof Response) {
                  const errorObj = await error.json();
                  errMessage += "\nUnable to proceed:\n" + errorObj.error;
                }
              }
            }
          }

          if (errMessage) {
            await channel.send(errMessage);
          }
        }
      }
    } else {
      ctx.response.body = "No access code received from authentication server.";
    }
  });

  app.listen(CALLBACK_SERVER_PORT, () => {
    consoleLog(`Server listening on port ${CALLBACK_SERVER_PORT}`);
  });

  //   This is how to set up HTTPS
  //   Shouldn't be needed if you are behind something like nginx
  //   https.createServer(app.callback()).listen(CALLBACK_SERVER_PORT, () => {
  //     consoleLog(`Server listening on port ${CALLBACK_SERVER_PORT}`);
  //   });
}

async function setDiscordRoles(
  channel: Channel,
  userId: string,
  characters: AuthenticatedCharacter[]
) {
  if (channel.isTextBased() && !channel.isDMBased()) {
    const member = channel.guild.members.cache.get(userId);

    // ensure the member exists
    if (!member) {
      consoleLog("Unable to find Discord member with ID = " + userId);
      return;
    }

    const uniqueCorps = characters
      .map((c) => c.corpId)
      .filter((value, index, array) => array.indexOf(value) === index);

    // create an array of unique tickers for this member
    const corpTickers = await Promise.all(
      uniqueCorps.map(async (corpId) => {
        const corp = await CorporationApiFactory().getCorporationsCorporationId(
          corpId
        );
        return `[${corp.ticker}]`;
      })
    );

    // remove roles that should not exist
    await Promise.all(
      member.roles.cache.map(async (corpRole) => {
        // if the Discord role starts with [ and ends with ]
        // and is NOT in the list we just created
        if (
          corpRole.name.startsWith("[") &&
          corpRole.name.endsWith("]") &&
          !corpTickers.includes(corpRole.name)
        ) {
          // then remove this role from this user
          await member.roles.remove(corpRole);
        }
      })
    );

    // ensure all the roles exist and are applied to this member
    await Promise.all(
      corpTickers.map(async (ticker) => {
        // get role by name
        let corpRole = channel.guild.roles.cache.find(
          (role) => role.name === ticker
        );

        if (!corpRole) {
          // a role for this corp does not exist, let's make one
          // TODO: Role colours!
          corpRole = await channel.guild.roles.create({ name: ticker });
        }

        if (!corpRole) {
          consoleLog("Unable to find or create a corp role for " + ticker);
        } else {
          if (!member.roles.cache.has(corpRole.id)) {
            await member.roles.add(corpRole);
          }
        }
      })
    );
  }
}

function getExpires(expires_in: number): Date {
  return new Date(Date.now() + (expires_in - 1) * 1000);
}

export async function checkNotificationsForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  const result = await getConfig(
    Array.prototype.concat(corp.members.map((m) => m.characters)),
    corp.nextNotificationCheck,
    NOTIFICATION_CHECK_DELAY,
    (c) => c.nextNotificationCheck,
    (c, next) => (c.nextNotificationCheck = next),
    "notifications",
    undefined
  );

  if (!result || !result.config || !result.config.accessToken) {
    return;
  }

  const { config, workingChars, thisChar } = result;

  corp.nextNotificationCheck = new Date(
    Date.now() + NOTIFICATION_CHECK_DELAY / workingChars.length + 10000
  );

  const notifications = await CharacterApiFactory(
    config
  ).getCharactersCharacterIdNotifications(thisChar.characterId);

  //consoleLog("notifications", notifications);

  // Get the notifications that we have not seen previously
  const selectedNotifications = notifications.filter(
    (note) => new Date(note.timestamp) > new Date(corp.mostRecentNotification)
  );

  // Iterate through each notification
  for (const notification of selectedNotifications) {
    const data = messageTypes.get(notification.type);
    if (data) {
      await data.handler(client, corp, notification, data);
    } else {
      consoleLog("No handler for message", notification);
    }

    const thisDate = new Date(notification.timestamp);
    if (thisDate > new Date(corp.mostRecentNotification)) {
      corp.mostRecentNotification = thisDate;
    }
  }

  await data.save();
}

export async function checkStructuresForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  const result = await getConfig(
    Array.prototype.concat(corp.members.map((m) => m.characters)),
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
    channelId: corp.channelId,
    corpId: corp.corpId,
    corpName: corp.corpName,
    members: corp.members,
    characters: undefined,
    structures: structures,
    nextStructureCheck: new Date(
      Date.now() + STRUCTURE_CHECK_DELAY / workingChars.length + 10000
    ),
    nextNotificationCheck: corp.nextNotificationCheck,
    mostRecentNotification: corp.mostRecentNotification,
  };

  // check for change
  await checkForChangeAndPersist(client, c);
}

async function findAsyncSequential<T>(
  array: T[],
  predicate: (t: T) => Promise<boolean>
): Promise<T | undefined> {
  for (const t of array) {
    if (await predicate(t)) {
      return t;
    }
  }
  return undefined;
}

async function getConfig(
  chars: AuthenticatedCharacter[],
  nextCheck: Date,
  checkDelay: number,
  getNextCheck: (c: AuthenticatedCharacter) => Date,
  setNextCheck: (c: AuthenticatedCharacter, next: Date) => void,
  checkType: string,
  requiredRole: GetCharactersCharacterIdRolesOk.RolesEnum | undefined
) {
  if (new Date(nextCheck) > new Date()) {
    // checking this record too soon!
    return;
  }

  // find all the chars that are currently authenticated
  // and will be available to use within the checking period
  const workingChars = chars.filter(
    (c) =>
      !c.needsReAuth &&
      new Date(getNextCheck(c)) < new Date(Date.now() + checkDelay)
  );

  // get the first authorised char that is able to make a fresh call to ESI
  // and has any required roles
  const thisChar = await findAsyncSequential(workingChars, async (c) => {
    if (new Date(getNextCheck(c)) < new Date()) {
      if (requiredRole) {
        const roles = await CharacterApiFactory(
          config
        ).getCharactersCharacterIdRoles(c.characterId);

        if (!roles.roles || !roles.roles.includes(requiredRole)) {
          // This character does not have the required role

          // mark this character so we don't use it to check this again today!
          setNextCheck(c, new Date(Date.now() + NO_ROLE_DELAY + 5000));

          return false;
        }
      }
      return true;
    }
    return false;
  });

  if (!thisChar) {
    consoleLog(`No available character to check ${checkType} with!`);
    return;
  }

  const config = new Configuration();

  try {
    // mark this character so we don't use it to check again too soon
    setNextCheck(thisChar, new Date(Date.now() + checkDelay + 1000));

    if (new Date(thisChar.tokenExpires) <= new Date()) {
      // auth token has expired, let's refresh it
      consoleLog("refreshing token");
      const response = await sso.getAccessToken(thisChar.refreshToken, true);
      thisChar.authToken = response.access_token;
      thisChar.refreshToken = response.refresh_token;
      thisChar.tokenExpires = getExpires(response.expires_in);
    }

    config.accessToken = thisChar.authToken;
  } catch (error) {
    if (error instanceof HTTPFetchError) {
      consoleLog(
        `HttpError ${error.response.status} while refreshing token`,
        error.message
      );

      if (error.response.status === 401) {
        // unauthorised
        consoleLog("Marking character as needing re-authorisation");
        thisChar.needsReAuth = true;
      }
    } else if (error instanceof Error) {
      consoleLog("Error while refreshing token", error.message);
    }
  }

  consoleLog("token refreshed");
  return { config, workingChars, thisChar };
}

export function generateCorpDetailsEmbed(thisCorp: AuthenticatedCorp) {
  const allChars: AuthenticatedCharacter[] = Array.prototype.concat(
    thisCorp.members.map((m) => m.characters)
  );
  const chars = allChars.filter((c) => !c.needsReAuth);
  const needReauth = chars.filter((c) => c.needsReAuth);

  const fields = [];

  fields.push({
    name: "\u200b",
    value: `Tracking ${chars.length} authorised character${
      chars.length == 1 ? "" : "s"
    }.`,
  });

  fields.push({
    name: "\u200b",
    value: `Checking notifications every ${
      Math.round(100 / chars.length) / 10
    } minutes.`,
  });

  fields.push({
    name: "\u200b",
    value: `Checking stucture status every ${
      Math.round(600 / chars.length) / 10
    } minutes.`,
  });

  if (chars.length < 10) {
    fields.push({
      name: "\u200b",
      value: `Recommend authorising at least ${
        10 - chars.length
      } more characters!`,
    });
  }

  if (needReauth.length > 0) {
    fields.push({
      name: "\u200b",
      value: `${needReauth.length} character ${
        needReauth.length == 1 ? "" : "s"
      } need${
        needReauth.length == 1 ? "s" : ""
      } to be re-authorised (use /checkauth for details)`,
    });
  }

  fields.push({
    name: "\u200b",
    value: `Corporation has ${thisCorp.structures.length} structures.`,
  });

  return new EmbedBuilder()
    .setColor(0x0000ff)
    .setTitle(thisCorp.corpName)
    .setThumbnail(
      `https://images.evetech.net/corporations/${thisCorp.corpId}/logo?size=64`
    )
    .addFields(fields);
}
