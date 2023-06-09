import { Client, EmbedBuilder } from "discord.js";
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

        if (channel?.isTextBased()) {
          let errMessage = "";
          const expires = getExpires(info.expires_in);

          const char = await CharacterApiFactory().getCharactersCharacterId(
            charId
          );
          consoleLog("char", char);
          const corpId = char.corporation_id;
          if (!corpId) {
            errMessage += "\nCharacter is not in a Corporation";
          } else {
            const corp =
              await CorporationApiFactory().getCorporationsCorporationId(
                corpId
              );
            if (corp.name) {
              try {
                const config = new Configuration();
                config.accessToken = info.access_token;

                const roles = await CharacterApiFactory(
                  config
                ).getCharactersCharacterIdRoles(charId);

                if (
                  !roles.roles ||
                  !roles.roles.includes(
                    GetCharactersCharacterIdRolesOk.RolesEnum.StationManager
                  )
                ) {
                  errMessage += `\n${char.name} does not have the Station Manager Role.  Give the role in game and re-auth here after 1 hour (thanks CCP!).`;
                } else {
                  const character: AuthenticatedCharacter = {
                    discordId: userId,
                    characterId: charId,
                    characterName: char.name,
                    authToken: info.access_token,
                    tokenExpires: expires,
                    refreshToken: info.refresh_token,
                    nextStructureCheck: new Date(),
                    nextNotificationCheck: new Date(),
                    needsReAuth: false,
                  };

                  let thisCorp = data.authenticatedCorps.find(
                    (ac) => ac.channelId == channelId && ac.corpId == corpId
                  );
                  if (!thisCorp) {
                    thisCorp = {
                      channelId: channelId,
                      corpId: corpId,
                      corpName: corp.name,
                      characters: [],
                      structures: [],
                      nextStructureCheck: new Date(),
                      nextNotificationCheck: new Date(),
                      mostRecentNotification: new Date(),
                    };
                    data.authenticatedCorps.push(thisCorp);
                  }

                  const idx = thisCorp.characters.findIndex(
                    (ch) => ch.characterId == charId
                  );
                  if (idx > -1) {
                    thisCorp.characters[idx] = character;
                  } else {
                    thisCorp.characters.push(character);
                  }

                  await channel.send(`Successfully authenticated ${char.name}`);

                  await channel.send({
                    embeds: [generateCorpDetailsEmbed(thisCorp)],
                  });

                  await data.save();
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

function getExpires(expires_in: number): Date {
  return new Date(Date.now() + (expires_in - 1) * 1000);
}

export async function checkNotificationsForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  const result = await getConfig(
    corp.characters,
    corp.nextNotificationCheck,
    NOTIFICATION_CHECK_DELAY,
    (c) => c.nextNotificationCheck,
    (c, next) => (c.nextNotificationCheck = next),
    "notifications"
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
    corp.characters,
    corp.nextStructureCheck,
    STRUCTURE_CHECK_DELAY,
    (c) => c.nextStructureCheck,
    (c, next) => (c.nextStructureCheck = next),
    "structures"
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
    characters: corp.characters,
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

async function getConfig(
  chars: AuthenticatedCharacter[],
  nextCheck: Date,
  checkDelay: number,
  getNextCheck: (c: AuthenticatedCharacter) => Date,
  setNextCheck: (c: AuthenticatedCharacter, next: Date) => void,
  checkType: string
) {
  if (new Date(nextCheck) > new Date()) {
    // checking this record too soon!
    return;
  }

  // get all the chars that can currently check structures
  const workingChars = chars.filter((c) => !c.needsReAuth);

  // get the first char that is able to make a fresh call to ESI
  const thisChar = workingChars.find(
    (c) => new Date(getNextCheck(c)) < new Date()
  );

  if (!thisChar) {
    consoleLog(`No available character to check ${checkType} with!`);
    return;
  }

  const config = new Configuration();

  try {
    // mark this character so we don't use it to check again too soon
    setNextCheck(thisChar, new Date(Date.now() + checkDelay + 5000));

    //if (new Date(thisChar.tokenExpires) <= new Date()) {
    // auth token has expired, let's refresh it
    consoleLog("refreshing token");
    const response = await sso.getAccessToken(thisChar.refreshToken, true);
    thisChar.authToken = response.access_token;
    thisChar.refreshToken = response.refresh_token;
    thisChar.tokenExpires = getExpires(response.expires_in);
    //}

    config.accessToken = thisChar.authToken;
  } catch (error: any) {
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
  const chars = thisCorp.characters.filter((c) => !c.needsReAuth);
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
