import Router from "@koa/router";
import { Client } from "discord.js";
import {
  CharacterApiFactory,
  Configuration,
  CorporationApiFactory,
  GetCharactersCharacterIdRolesOk,
} from "eve-client-ts";
import SingleSignOn from "eve-sso";
import Koa from "koa";
import { authenticatedCharacter, authenticatedCorp } from "./data/data";
import { checkForChangeAndPersist, data } from "./Bot";
import {
  getStructureIdFromAttackNotificationText,
  isAttackNotification,
} from "./data/notification";
//import https from "https";

export let sso: SingleSignOn;
const STRUCTURE_CHECK_DELAY = 1000 * 60 * 60; // 1 hour
const NOTIFICATION_CHECK_DELAY = 1000 * 60 * 10; // 10 mins

export function setup(client: Client) {
  // Get the client ID and secret from the Eve developers section
  const CLIENT_ID = process.env.EVE_CLIENT_ID || "";
  const SECRET = process.env.EVE_SECRET_KEY || "";
  // The callback URI as defined in the application in the developers section
  const CALLBACK_URI = process.env.EVE_CALLBACK_URL || "";
  const CALLBACK_SERVER_PORT = Number(
    process.env.CALLBACK_SERVER_PORT || "8080"
  );

  sso = new SingleSignOn(CLIENT_ID, SECRET, CALLBACK_URI, {
    endpoint: "https://login.eveonline.com",
    userAgent: "eve-structure-bot",
  });

  const app = new Koa();
  const router = new Router();

  // Handle the SSO callback (this route is the CALLBACK_URI above)
  router.get("/callback", async (ctx) => {
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
      console.log("info", info);

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
          let message = `Successfully authenticated ${info.decoded_access_token.name}.`;
          const expires = getExpires(info.expires_in);

          const char = await CharacterApiFactory().getCharactersCharacterId(
            charId
          );
          console.log("char", char);
          const corpId = char.corporation_id;
          if (!corpId) {
            message += "\nCharacter is not in a Corporation";
          } else {
            const corp =
              await CorporationApiFactory().getCorporationsCorporationId(
                corpId
              );
            if (corp.name) {
              message += `\nCharacter is a member of ${corp.name}. `;

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
                  message += `\n${char.name} does not have the Station Manager Role.  Give the role in game and re-auth here after 1 hour (thanks CCP!).`;
                } else {
                  const character: authenticatedCharacter = {
                    discordId: userId,
                    characterId: charId,
                    characterName: char.name,
                    authToken: info.access_token,
                    tokenExpires: expires,
                    refreshToken: info.refresh_token,
                    nextStructureCheck: new Date(0),
                    nextNotificationCheck: new Date(0),
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
                      nextStructureCheck: new Date(0),
                      nextNotificationCheck: new Date(0),
                      mostRecentNotification: new Date(0),
                    };
                    data.authenticatedCorps.push(thisCorp);
                  }

                  const idx = thisCorp.characters.findIndex(
                    (ch) => (ch.characterId = charId)
                  );
                  if (idx > -1) {
                    thisCorp.characters[idx] = character;
                  } else {
                    thisCorp.characters.push(character);
                  }
                }
              } catch (error) {
                console.log("error", error);
                if (error instanceof Response) {
                  const errorObj = await error.json();
                  message += "\nUnable to proceed:\n" + errorObj.error;
                }
              }
            }
          }

          channel.send(message);
        }
      }
    } else {
      ctx.response.body = "No access code received from authentication server.";
    }
  });

  app.use(router.middleware());
  app.listen(CALLBACK_SERVER_PORT, () => {
    console.log(`Server listening on port ${CALLBACK_SERVER_PORT}`);
  });

  //   This is how to set up HTTPS
  //   https.createServer(app.callback()).listen(CALLBACK_SERVER_PORT, () => {
  //     console.log(`Server listening on port ${CALLBACK_SERVER_PORT}`);
  //   });
}

function getExpires(expires_in: number): Date {
  return new Date(Date.now() + (expires_in - 1) * 1000);
}

export async function checkNotificationsForCorp(
  corp: authenticatedCorp,
  client: Client
) {
  const result = await getConfig(
    corp.characters,
    corp.nextNotificationCheck,
    NOTIFICATION_CHECK_DELAY,
    (c) => c.nextNotificationCheck,
    "notifications"
  );

  if (!result) {
    return;
  }

  const { config, workingChars, thisChar } = result;

  const notifications = await CharacterApiFactory(
    config
  ).getCharactersCharacterIdNotifications(thisChar.characterId);

  console.log("notifications", notifications);

  corp.nextNotificationCheck = new Date(
    Date.now() + NOTIFICATION_CHECK_DELAY / workingChars.length + 10000
  );

  const attackNotifications = notifications.filter(
    (note) =>
      isAttackNotification(note) &&
      new Date(note.timestamp) > new Date(corp.mostRecentNotification)
  );

  const channel = client.channels.cache.get(corp.channelId);
  if (channel && channel.isTextBased()) {
    for (const note of attackNotifications) {
      let message = "";
      if (note.text) {
        const structId = getStructureIdFromAttackNotificationText(note.text);
        const thisStruct = corp.structures.find(
          (struct) => struct.structure_id === structId
        );
        if (thisStruct) {
          message = `${thisStruct.name} was under attack <t:${
            new Date(note.timestamp).getTime() / 1000
          }:R>`;
        }
      }
      if (message.length == 0) {
        message = `A structure was under attack <t:${
          new Date(note.timestamp).getTime() / 1000
        }:R>. Not sure which one!`;
      }
      channel.send(message);
    }
  }

  for (const note of notifications) {
    if (new Date(note.timestamp) > new Date(corp.mostRecentNotification)) {
      corp.mostRecentNotification = note.timestamp;
    }
  }
}

export async function checkStructuresForCorp(
  corp: authenticatedCorp,
  client: Client
) {
  const result = await getConfig(
    corp.characters,
    corp.nextStructureCheck,
    STRUCTURE_CHECK_DELAY,
    (c) => c.nextStructureCheck,
    "structures"
  );

  if (!result) {
    return;
  }

  const { config, workingChars, thisChar } = result;

  const structures = await CorporationApiFactory(
    config
  ).getCorporationsCorporationIdStructures(corp.corpId);

  console.log("structs", structures);

  const c: authenticatedCorp = {
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
  chars: authenticatedCharacter[],
  nextCheck: Date,
  checkDelay: number,
  getNextCheck: (c: authenticatedCharacter) => Date,
  checkType: string
) {
  if (new Date(nextCheck) > new Date()) {
    // checking this record too soon!
    console.log(`too soon to check for ${checkType}, keep waiting`);
    return;
  }

  // get all the chars that can currently check structures
  const workingChars = chars.filter((c) => !c.needsReAuth);

  // get the first char that is able to make a fresh call to ESI
  const thisChar = workingChars.find(
    (c) => new Date(getNextCheck(c)) < new Date()
  );

  if (!thisChar) {
    console.log(`No available character to check ${checkType} with!`);
    return;
  }

  if (new Date(thisChar.tokenExpires) <= new Date()) {
    console.log("refreshing token");
    // auth token has expired, let's refresh it
    const response = await sso.getAccessToken(thisChar.refreshToken, true);
    thisChar.authToken = response.access_token;
    thisChar.refreshToken = response.refresh_token;
    thisChar.tokenExpires = getExpires(response.expires_in);
  }

  // mark this character so we don't use it to check again too soon
  thisChar.nextStructureCheck = new Date(Date.now() + checkDelay + 5000);

  const config = new Configuration();
  config.accessToken = thisChar.authToken;

  return { config, workingChars, thisChar };
}
