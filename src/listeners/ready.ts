import { Client, DiscordAPIError, PermissionsBitField, TextChannel } from "discord.js";
import { Commands } from "../Commands";
import { consoleLog, data, delay } from "../Bot";
import { checkMembership } from "../EveSSO";
import { checkNotificationsForCorp } from "../notifications";
import { checkStarbasesForCorp } from "../starbases";
import { checkStructuresForCorp } from "../structures";
import { GetCharactersCharacterIdRolesOk } from "eve-client-ts";
import { setErrorChannel, logInfo, logWarning, logErrorLevel } from "../errorLogger";

const POLL_ATTEMPT_DELAY = 2000;
let corpIndex = 0;

export default (client: Client): void => {
  client.on("ready", async () => {
    if (!client.user || !client.application) {
      return;
    }

    await client.application.commands.set(Commands);

    consoleLog(`${client.user.username} is online`);

    // Enumerate channels and find error channel
    await findErrorChannel(client);

    await startPolling(client);
  });
};

/**
 * Find and set the error channel during startup
 */
async function findErrorChannel(client: Client) {
  const errorChannelId = process.env.ERROR_CHANNEL_ID;
  
  if (!errorChannelId) {
    consoleLog("ERROR_CHANNEL_ID not configured in environment");
    return;
  }

  try {
    // Try to fetch the channel
    const channel = await client.channels.fetch(errorChannelId);
    
    if (channel instanceof TextChannel) {
      setErrorChannel(channel);
      logInfo(`Error channel found: ${channel.name} in ${channel.guild.name}`);
    } else {
      logWarning(`ERROR_CHANNEL_ID ${errorChannelId} is not a text channel`);
    }
  } catch (error) {
    if (error instanceof DiscordAPIError) {
      logErrorLevel(`Failed to fetch error channel ${errorChannelId}`, error);
    } else {
      logErrorLevel(`Unexpected error fetching error channel`, error);
    }
  }
}

async function startPolling(client: Client) {
  // infinite loop required
  do {
    try {
      const availableCorps = data.authenticatedCorps.filter((c) => c.serverId && c.channelIds.length > 0);
      if (corpIndex < 0 || corpIndex > availableCorps.length - 1)
        corpIndex = 0;

      consoleLog(
        `Poll index: ${corpIndex} - Corp Count: ${availableCorps.length}`
      );

      const thisCorp = availableCorps[corpIndex];

      if (thisCorp) {
        for (const channelId of thisCorp.channelIds) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel instanceof TextChannel) {
              if (client.user) {
                const permissions = channel.permissionsFor(client.user);
                if (!permissions?.has([
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages
                ])) {
                  consoleLog("No permission to post in " + channel.name);
                  thisCorp.channelIds = thisCorp.channelIds.filter((c) => c != channelId);
                  await data.save();
                }
              }
            }
          } catch (error) {
            if (error instanceof DiscordAPIError && error.code === 50001) {
              logWarning("Failed to check permissions for channel " + channelId + ". Removing channel!");
              thisCorp.channelIds = thisCorp.channelIds.filter((c) => c != channelId);
              await data.save();
            } else {
              logErrorLevel("Unexpected error checking channel permissions", error);
            }
          }
        }

        try {
          const guild = await client.guilds.fetch(thisCorp.serverId);
          thisCorp.serverName = guild.name;
        } catch (error) {
          if (error instanceof DiscordAPIError && error.code === 10004) {
            logWarning("Server not found for ID " + thisCorp.corpName);
            consoleLog(thisCorp.channelIds.length + " channels found for server " + thisCorp.corpName);
            thisCorp.serverId = "";
            await data.save();
            corpIndex++;
            continue;
          } else {
            logErrorLevel("Unexpected error fetching guild", error);
          }
        }

        if (thisCorp.channelIds.length == 0) {
          corpIndex++;
          continue;
        }

        // Use Corp members list rather than player's corp
        await checkMembership(client, thisCorp);

        // checkMembership could delete the corp if it has no members!!
        if (thisCorp.members.length == 0) {
          corpIndex++;
          continue;
        }

        const updatedCorp = availableCorps[corpIndex];

        if (updatedCorp) {

          const notAuthedChars = updatedCorp.members.flatMap((m) => m.characters.filter((c) => c.needsReAuth))
            .map((c) => c.characterName);

          if (notAuthedChars.length > 0) {
            consoleLog("Not Authed", "\n" + notAuthedChars.join("\n"));
          }

          var authedChars = updatedCorp.members.flatMap((m) => m.characters.filter((c) => !c.needsReAuth))
            .sort((a, b) => new Date(a.nextNotificationCheck).getTime() - new Date(b.nextNotificationCheck).getTime())
            .map((c) => c.characterName
              + " " + (c.roles?.includes(GetCharactersCharacterIdRolesOk.RolesEnum.Director) ? " (Director)" :
                c.roles?.includes(GetCharactersCharacterIdRolesOk.RolesEnum.StationManager) ? " (Manager)" :
                  "")
              + " in " + (new Date(c.nextNotificationCheck).getTime() - Date.now()) / 1000 + " seconds"
            )
            .join("\n");

          consoleLog("Authed Chars", "\n" + authedChars);

          await checkStructuresForCorp(updatedCorp, client);
          await checkStarbasesForCorp(updatedCorp, client);
          await checkNotificationsForCorp(updatedCorp, client);
        }

        client.user?.setActivity(
          `Checking Structures at ${new Date(Date.now()).toUTCString()}`
        );
      }

    } catch (error) {
      logErrorLevel("An error occured in main loop", error);
    }
    corpIndex++;

    await delay(POLL_ATTEMPT_DELAY);

  } while (true);
}
