import { Client, Guild, HTTPError, TextChannel } from "discord.js";
import {
  CharacterApiFactory,
  Configuration,
  CorporationApiFactory,
  GetCharactersCharacterIdRolesOk,
} from "eve-client-ts";
import SingleSignOn, { HTTPFetchError } from "@after_ice/eve-sso";
import Koa from "koa";
import { AuthenticatedCharacter, AuthenticatedCorp } from "./data/data";
import {
  NOTIFICATION_CHECK_DELAY,
  NO_ROLE_DELAY,
  consoleLog,
  data,
  sendMessage,
} from "./Bot";
import { messageTypes } from "./data/notification";
import { generateCorpDetailsEmbed } from "./embeds/corpDetails";
//HTTPS shouldn't be needed if you are behind something like nginx
//import https from "https";

let _sso: SingleSignOn;
export function sso(): SingleSignOn {
  return _sso;
}

export function setup(client: Client) {
  // Get the client ID and secret from the Eve developers section
  const CLIENT_ID = process.env.EVE_CLIENT_ID ?? "";
  const SECRET = process.env.EVE_SECRET_KEY ?? "";
  // The callback URI as defined in the application in the developers section
  const CALLBACK_URI = process.env.EVE_CALLBACK_URL ?? "";
  const CALLBACK_SERVER_PORT = Number(
    process.env.CALLBACK_SERVER_PORT ?? "8080"
  );

  _sso = new SingleSignOn(CLIENT_ID, SECRET, CALLBACK_URI, {
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
      const info = await sso().getAccessToken(code);

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

        if (channel instanceof TextChannel) {
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
                    serverId: channel.guildId,
                    channelId: channelId,
                    corpId: corpId,
                    corpName: corp.name,
                    members: [],
                    characters: undefined,
                    starbases: [],
                    structures: [],
                    nextStarbaseCheck: new Date(),
                    nextStructureCheck: new Date(),
                    nextNotificationCheck: new Date(),
                    mostRecentNotification: new Date(),
                    setDiscordRoles: false,
                  };
                  data.authenticatedCorps.push(thisCorp);
                }

                if (!thisCorp.serverId) thisCorp.serverId = channel.guildId;

                // make a new version of the character that just got authenticated
                const character: AuthenticatedCharacter = {
                  discordId: userId,
                  characterId: charId,
                  characterName: char.name,
                  corpId: char.corporation_id,
                  authToken: info.access_token,
                  tokenExpires: expires,
                  refreshToken: info.refresh_token,
                  nextStarbaseCheck: new Date(),
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

                await sendMessage(
                  channel,
                  `Successfully authenticated ${char.name}`,
                  `Auth success for ${char.name}`
                );

                await sendMessage(
                  channel,
                  {
                    embeds: [generateCorpDetailsEmbed(thisCorp)],
                  },
                  "Corp Details"
                );

                await data.save();

                // use tickers to set Discord Roles - this may not be ready for production
                if (thisCorp.setDiscordRoles) {
                  await setDiscordRoles(channel.guild, userId);
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
            await sendMessage(
              channel,
              errMessage,
              `error during auth ${errMessage}`
            );
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

export async function checkMembership(client: Client, corp: AuthenticatedCorp) {
  for (const corpMember of corp.members) {
    for (const char of corpMember.characters) {
      let corpConfirmed = true;
      const config = await getAccessToken(char);

      if (config.accessToken) {
        try {
          const memberList = await CorporationApiFactory(
            config
          ).getCorporationsCorporationIdMembers(char.corpId);

          if (memberList.includes(char.characterId)) {
            // character is confirmed as a member of this corp
            // take no action
          } else {
            // this should not be possible as the ESI let us fetch this Corp's
            // member list but then this character is not in that list!?!?
            corpConfirmed = false;
          }
        } catch (error) {
          // Failed to get the Member list for this corp

          const httpError = error as HTTPError;
          if (httpError?.status == 403) {
            // if error code is 403 then this character is not a member
            // of the corp specified
            consoleLog(
              `${char.characterName} is not authed for corp ${corp.corpName}!!!`
            );
            corpConfirmed = false;
          }
        }

        if (!corpConfirmed) {
          // The character is NOT in the corp the ESI says it is in!!!

          const serverCorps = data.authenticatedCorps.filter(
            (ac) => ac.serverId == corp.serverId && ac.corpId == char.corpId
          );

          serverCorps.forEach((c) => {
            // ensure the character is removed from this corp
            c.members.forEach((m) => {
              m.characters = m.characters.filter(
                (c) => c.characterId != char.characterId
              );
            });
          });

          // TODO:Let's check all the other corps that are authenticated to see if
          // we can figure out which corp this character is really in.
        }
      }
    }

    if (corp.setDiscordRoles) {
      const guild = client.guilds.cache.get(corp.serverId);
      if (guild) {
        // confirmed membership may have changed
        // update the roles in Discord
        await setDiscordRoles(guild, corpMember.discordId);
      }
    }
  }
}

async function setDiscordRoles(guild: Guild, userId: string) {
  const member = await guild.members.fetch(userId);

  // ensure the member exists
  if (!member) {
    consoleLog(
      `Unable to find Discord member of ${guild.name} with ID ${userId}`
    );
    return;
  }

  const serverCorps = data.authenticatedCorps.filter(
    (ac) => ac.serverId == guild.id
  );

  // TODO: ensure that members get removed from a corp collection when they have no authenticated characters in that corp
  const uniqueCorps = serverCorps
    .filter((c) =>
      c.members.some((cm) => cm.discordId == userId && cm.characters.length > 0)
    )
    .map((c) => c.corpId)
    .filter((value, index, array) => array.indexOf(value) === index);

  // create an array of unique tickers for this member
  const corpTickers = await Promise.all(
    uniqueCorps.map(async (corpId) => {
      if (!corpId) return "";
      const corp = await CorporationApiFactory().getCorporationsCorporationId(
        corpId
      );
      return `[${corp.ticker}]`;
    })
  );

  // remove roles that should not exist
  await Promise.all(
    member.roles.cache.map((corpRole) => {
      // if the Discord role starts with [ and ends with ]
      // and is NOT in the list we just created
      if (
        corpRole.name.startsWith("[") &&
        corpRole.name.endsWith("]") &&
        !corpTickers.includes(corpRole.name)
      ) {
        // then remove this role from this user
        return member.roles.remove(corpRole);
      }
    })
  );

  // ensure all the roles exist and are applied to this member
  await Promise.all(
    corpTickers
      .filter((ticker) => ticker)
      .map(async (ticker) => {
        // get role by name
        let corpRole = guild.roles.cache.find((role) => role.name === ticker);

        if (!corpRole) {
          // a role for this corp does not exist, let's make one
          // TODO: Role colours!
          corpRole = await guild.roles.create({ name: ticker });
        }

        if (!corpRole) {
          consoleLog("Unable to find or create a corp role for " + ticker);
        } else {
          if (!member.roles.cache.has(corpRole.id)) {
            return member.roles.add(corpRole);
          }
        }
      })
  );
}

function getExpires(expires_in: number): Date {
  return new Date(Date.now() + (expires_in - 1) * 1000);
}

export async function checkNotificationsForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  consoleLog("checkNotificationsForCorp ", corp.corpName);

  const result = await getConfig(
    Array.prototype.concat(corp.members.flatMap((m) => m.characters)),
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
      await data.handler(
        client,
        corp,
        notification,
        data.message,
        data.colour,
        data.get_role_to_mention
      );
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

export async function getConfig(
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
        consoleLog("checking role", requiredRole);
        const roles = await CharacterApiFactory(
          await getAccessToken(c)
        ).getCharactersCharacterIdRoles(c.characterId);

        if (!roles.roles || !roles.roles.includes(requiredRole)) {
          // This character does not have the required role
          consoleLog("no role", requiredRole);

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

  const config = await getAccessToken(thisChar);

  // mark this character so we don't use it to check again too soon
  setNextCheck(thisChar, new Date(Date.now() + checkDelay + 1000));

  return { config, workingChars, thisChar };
}

async function getAccessToken(thisChar: AuthenticatedCharacter) {
  const config = new Configuration();

  try {
    if (new Date(thisChar.tokenExpires) <= new Date()) {
      // auth token has expired, let's refresh it
      consoleLog("refreshing token for ", thisChar.characterName);
      const response = await sso().getAccessToken(thisChar.refreshToken, true);
      thisChar.authToken = response.access_token;
      thisChar.refreshToken = response.refresh_token;
      thisChar.tokenExpires = getExpires(response.expires_in);
    }

    config.accessToken = thisChar.authToken;
    consoleLog("token refreshed");
  } catch (error) {
    if (error instanceof HTTPFetchError) {
      consoleLog(
        `HttpError ${error.response.status} while refreshing token`,
        error.message
      );

      if (error.response.status > 399 && error.response.status < 500) {
        // unauthorised
        consoleLog("Marking character as needing re-authorisation");
        thisChar.needsReAuth = true;
      }
    } else if (error instanceof Error) {
      consoleLog("Error while refreshing token", error.message);
    }
  }

  return config;
}
