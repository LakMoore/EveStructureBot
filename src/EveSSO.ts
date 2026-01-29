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
import { GET_ROLES_DELAY, consoleLog, data, sendMessage } from "./Bot";
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
    process.env.CALLBACK_SERVER_PORT ?? "8080",
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
        subParts.length > 0 ? subParts[subParts.length - 1] : "0",
      );

      // Do whatever, for example, redirect to user page
      ctx.response.body =
        "Authentication successful.  Please close this browser window and continue working with EveStructureBot in the Discord channel.";

      if (channelId && !Array.isArray(channelId) && channelId != "unknown") {
        const channel = client.channels.cache.get(channelId);

        if (channel instanceof TextChannel) {
          let errMessage = "";
          const expires = getExpires(info.expires_in);

          const char =
            await CharacterApiFactory().getCharactersCharacterId(charId);
          consoleLog("char", char);

          // char.corporation_id could be up to 6 days old!
          // let's get the history to find the current corp
          const corpHistory =
            await CharacterApiFactory().getCharactersCharacterIdCorporationhistory(
              charId,
            );
          consoleLog("corpHistory", corpHistory);

          const corpId =
            corpHistory.length > 0
              ? corpHistory[0].corporation_id
              : char.corporation_id;

          if (!corpId) {
            errMessage +=
              "\nCharacter is not in a Corporation. Unable to proceed.";
          } else {
            const corp =
              await CorporationApiFactory().getCorporationsCorporationId(
                corpId,
              );

            if (corp.name) {
              try {
                const config = new Configuration();
                config.accessToken = info.access_token;

                let thisCorp = data.authenticatedCorps.find(
                  (ac) => ac.corpId == corpId,
                );

                // only Directors can add new corps to new channels
                if (!thisCorp || !thisCorp.channelIds.includes(channelId)) {
                  const roles =
                    await CharacterApiFactory(
                      config,
                    ).getCharactersCharacterIdRoles(charId);
                  if (
                    !roles?.roles?.includes(
                      GetCharactersCharacterIdRolesOk.RolesEnum.Director,
                    )
                  ) {
                    await sendMessage(
                      channel,
                      `Only Directors can add new Corporations to new channels.`,
                      `Only Directors can add new Corporations to new channels.`,
                    );
                    return;
                  }
                }

                // a corp can only be in one Discord server at a time!
                if (
                  thisCorp &&
                  thisCorp.serverId &&
                  thisCorp.serverId != channel.guildId
                ) {
                  await sendMessage(
                    channel,
                    `This Corporation is already being monitored in another Discord server.`,
                    `This Corporation is already being monitored in another Discord server.`,
                  );
                  return;
                }

                if (!thisCorp) {
                  thisCorp = {
                    serverId: channel.guildId,
                    serverName: channel.guild.name,
                    channelId: undefined,
                    channelIds: [],
                    corpId: corpId,
                    corpName: corp.name,
                    members: [],
                    characters: undefined,
                    starbases: [],
                    structures: [],
                    nextStarbaseCheck: new Date(0),
                    nextStructureCheck: new Date(0),
                    nextNotificationCheck: new Date(0),
                    mostRecentNotification: new Date(0),
                    setDiscordRoles: false,
                    addedAt: new Date(),
                    maxCharacters: 1,
                    maxDirectors: 1,
                    mostRecentAuthAt: new Date(),
                  };
                  data.authenticatedCorps.push(thisCorp);
                }

                // this used to be nullable so just set it
                thisCorp.serverId = channel.guildId;
                // server names can change so get the current name
                thisCorp.serverName = channel.guild.name;
                if (!thisCorp.channelIds.includes(channelId)) {
                  thisCorp.channelIds.push(channelId);
                }

                // search for the Corp member
                const memberIdx = thisCorp.members.findIndex(
                  (corpMember) => corpMember.discordId === userId,
                );

                // make a new version of the character that just got authenticated
                const character: AuthenticatedCharacter = {
                  discordId: userId,
                  characterId: charId,
                  characterName: char.name,
                  corpId: char.corporation_id,
                  authToken: info.access_token,
                  tokenExpires: expires,
                  refreshToken: info.refresh_token,
                  nextStarbaseCheck: new Date(0),
                  nextStructureCheck: new Date(0),
                  nextNotificationCheck: new Date(0),
                  nextRolesCheck: new Date(0),
                  roles: [],
                  needsReAuth: false,
                  addedAt: new Date(),
                  mostRecentAuthAt: new Date(),
                  authFailedAt: new Date(0),
                };

                if (memberIdx > -1) {
                  // if the member is already known
                  const corpMember = thisCorp.members[memberIdx];
                  // search the member for the character
                  const idx = corpMember.characters.findIndex(
                    (ch) => ch.characterId == charId,
                  );

                  if (idx > -1) {
                    // if the character is already known, reset the fields (but not the check dates)
                    const oldCharacter = corpMember.characters[idx];
                    oldCharacter.characterId = charId;
                    oldCharacter.characterName = char.name;
                    oldCharacter.corpId = char.corporation_id;
                    oldCharacter.authToken = info.access_token;
                    oldCharacter.tokenExpires = expires;
                    oldCharacter.refreshToken = info.refresh_token;
                    oldCharacter.needsReAuth = false;
                    oldCharacter.mostRecentAuthAt = new Date();
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
                  `Auth success for ${char.name}`,
                );

                await sendMessage(
                  channel,
                  {
                    embeds: [generateCorpDetailsEmbed(thisCorp)],
                  },
                  "Corp Details",
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
              `error during auth ${errMessage}`,
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
    for (const char of corpMember.characters.filter((c) => !c.needsReAuth)) {
      let corpConfirmed = true;
      const config = await getAccessToken(char);

      if (config.accessToken) {
        try {
          const memberList = await CorporationApiFactory(
            config,
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
            // if error code is 403 then this character might not be in the corp
            // or the auth token has expired

            // ping the member that owns this character
            for (const channel of corp.channelIds) {
              const channelObj = client.channels.cache.get(channel);
              if (channelObj instanceof TextChannel) {
                await sendMessage(
                  channelObj,
                  `<@${corpMember.discordId}> The ESI token for ${char.characterName} in ${corp.corpName} has expired! Please re-authenticate using /auth.`,
                  `<@${corpMember.discordId}> The ESI token for ${char.characterName} in ${corp.corpName} has expired! Please re-authenticate using /auth.`,
                );
              }
            }
            char.needsReAuth = true;
            char.authFailedAt = new Date();
            await data.save();
          }
        }

        if (!corpConfirmed) {
          // The character is NOT in the corp the ESI says it is in!!!

          const serverCorps = data.authenticatedCorps.filter(
            (ac) => ac.serverId == corp.serverId && ac.corpId == char.corpId,
          );

          for (const c of serverCorps) {
            // send a PSA to all channels
            for (const channel of c.channelIds) {
              const channelObj = client.channels.cache.get(channel);
              if (channelObj instanceof TextChannel) {
                await sendMessage(
                  channelObj,
                  `Character ${char.characterName} is no longer a member of corp ${corp.corpName} and will be removed.`,
                  `Character ${char.characterName} is no longer a member of corp ${corp.corpName}`,
                );
              }
            }

            // ensure the character is removed from this corp
            c.members.forEach((m) => {
              m.characters = m.characters.filter(
                (c) => c.characterId != char.characterId,
              );
            });
          }

          // incase the char is still in a corp somewhere
          char.corpId = 0;
          char.needsReAuth = true;
          char.authFailedAt = new Date();
          await data.save();

          // TODO: We could check all the other corps that are authenticated to see if
          // we can figure out which corp this character is really in.
        } else {
          // character is confirmed as a member of this corp
          // let's see if the roles need checking
          if (
            !char.nextRolesCheck ||
            new Date(char.nextRolesCheck) < new Date()
          ) {
            try {
              consoleLog("checking roles for character:", char.characterName);
              const roles = await CharacterApiFactory(
                await getAccessToken(char),
              ).getCharactersCharacterIdRoles(char.characterId);

              if (roles.roles) {
                char.roles = roles.roles;
                char.nextRolesCheck = new Date(
                  Date.now() + GET_ROLES_DELAY + 5000,
                );
                await data.save();
              }
            } catch (error) {
              consoleLog("error getting roles for character:", error);
            }
          }
        }
      }

      if (corp.setDiscordRoles) {
        const guild = await client.guilds.fetch(corp.serverId);
        if (guild) {
          // confirmed membership may have changed
          // update the roles in Discord
          await setDiscordRoles(guild, corpMember.discordId);
        }
      }

      // if this discord member has no characters, remove it
      if (corpMember.characters.length == 0) {
        consoleLog(
          "Removing member with no characters: ",
          corpMember.discordId,
        );
        var index = corp.members.findIndex(
          (ac) =>
            ac.discordId == corpMember.discordId && ac.characters.length == 0,
        );
        if (index > -1) {
          corp.members.splice(index, 1);
        }
        await data.save();
      }
    }
  }

  // update some stats
  corp.maxCharacters = Math.max(
    corp.members.reduce((acc, member) => acc + member.characters.length, 0),
    corp.maxCharacters,
  );
  corp.maxDirectors = Math.max(
    corp.members.reduce(
      (acc, member) =>
        acc +
        member.characters.filter((c) =>
          c.roles?.includes(GetCharactersCharacterIdRolesOk.RolesEnum.Director),
        ).length,
      0,
    ),
    corp.maxDirectors,
  );
  await data.save();

  // if this corp has no members, remove it
  if (corp.members.length == 0) {
    // send a PSA to all channels
    for (const channel of corp.channelIds) {
      const channelObj = client.channels.cache.get(channel);
      if (channelObj instanceof TextChannel) {
        await sendMessage(
          channelObj,
          `Corporation ${corp.corpName} has no authenticated members and will be removed from this channel and the server.`,
          `Corporation ${corp.corpName} has no authenticated members and will be removed.`,
        );
      }
    }

    consoleLog(
      "Removing channels and server from corp with no members: ",
      corp.corpName,
    );
    corp.channelIds = [];
    corp.serverId = "";
    await data.save();
  }
}

async function setDiscordRoles(guild: Guild, userId: string) {
  const member = await guild.members.fetch(userId);

  // ensure the member exists
  if (!member) {
    consoleLog(
      `Unable to find Discord member of ${guild.name} with ID ${userId}`,
    );
    return;
  }

  const serverCorps = data.authenticatedCorps.filter(
    (ac) => ac.serverId == guild.id,
  );

  // TODO: ensure that members get removed from a corp collection when they have no authenticated characters in that corp
  const uniqueCorps = serverCorps
    .filter((c) =>
      c.members.some(
        (cm) => cm.discordId == userId && cm.characters.length > 0,
      ),
    )
    .map((c) => c.corpId)
    .filter((value, index, array) => array.indexOf(value) === index);

  // create an array of unique tickers for this member
  const corpTickers = await Promise.all(
    uniqueCorps.map(async (corpId) => {
      if (!corpId) return "";
      const corp =
        await CorporationApiFactory().getCorporationsCorporationId(corpId);
      return `[${corp.ticker}]`;
    }),
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
    }),
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
      }),
  );
}

function getExpires(expires_in: number): Date {
  return new Date(Date.now() + (expires_in - 1) * 1000);
}

export function getWorkingChars(
  corp: AuthenticatedCorp,
  nextCheck: Date,
  getNextCheck: (c: AuthenticatedCharacter) => Date,
  requiredRole: GetCharactersCharacterIdRolesOk.RolesEnum | undefined,
) {
  if (new Date(nextCheck) > new Date()) {
    // checking this record too soon!
    return [];
  }

  // find all the chars that are currently authenticated
  const workingChars = corp.members
    .flatMap((m) => m.characters)
    .filter(
      (c) =>
        !c.needsReAuth &&
        (requiredRole == undefined || c.roles?.includes(requiredRole)),
    )
    .sort(
      (a, b) =>
        new Date(getNextCheck(a)).getTime() -
        new Date(getNextCheck(b)).getTime(),
    );

  return workingChars;
}

export async function getAccessToken(thisChar: AuthenticatedCharacter) {
  const config = new Configuration();

  try {
    if (new Date(thisChar.tokenExpires) <= new Date()) {
      // auth token has expired, let's refresh it
      consoleLog("refreshing token for ", thisChar.characterName);
      const response = await sso().getAccessToken(thisChar.refreshToken, true);
      thisChar.authToken = response.access_token;
      thisChar.refreshToken = response.refresh_token;
      thisChar.tokenExpires = getExpires(response.expires_in);
      consoleLog("token refreshed");
    }
    config.accessToken = thisChar.authToken;
  } catch (error) {
    if (error instanceof HTTPFetchError) {
      consoleLog(
        `HttpError ${error.response.status} while refreshing token`,
        error.message,
      );

      if (error.response.status > 399 && error.response.status < 500) {
        // unauthorised
        consoleLog("Marking character as needing re-authorisation");
        thisChar.needsReAuth = true;
        thisChar.authFailedAt = new Date();
        await data.save();
      }
    } else if (error instanceof Error) {
      consoleLog("Error while refreshing token", error.message);
    }
  }

  return config;
}
