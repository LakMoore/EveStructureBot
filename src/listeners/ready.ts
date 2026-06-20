import {
  Client,
  DiscordAPIError,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import { Commands } from '../Commands';
import { data, delay } from '../Bot';
import { checkMembership } from '../EveSSO';
import { initialiseReloadCommandOptions } from '../commands/reload';
import { checkNotificationsForCorp } from '../notifications';
import { checkStarbasesForCorp } from '../starbases';
import { checkStructuresForCorp } from '../structures';
import GuildFinder from '../GuildFinder';
import { LOGGER } from '../Logger';

const POLL_ATTEMPT_DELAY = 3000;
let corpIndex = 0;

export default (client: Client): void => {
  client.on('ready', async () => {
    if (!client.user || !client.application) {
      return;
    }

    await initialiseReloadCommandOptions();
    await client.application.commands.set(Commands);

    LOGGER.info(`${client.user.username} is online`);

    // locate our guild and error channel and store it in LOGGER
    await GuildFinder.findAndStoreErrorChannel(client);

    LOGGER.warning(
      'Starting polling for structures, starbases and notifications...'
    );

    await startPolling(client);
  });
};

async function startPolling(client: Client) {
  // infinite loop required
  do {
    try {
      const availableCorps = data.authenticatedCorps.filter(
        (c) => c.serverId && c.channelIds.length > 0
      );
      if (corpIndex < 0 || corpIndex > availableCorps.length - 1) {
        corpIndex = 0;
        await delay(POLL_ATTEMPT_DELAY);
      }

      LOGGER.info(
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
                if (
                  !permissions?.has([
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                  ])
                ) {
                  LOGGER.warning('No permission to post in ' + channel.name);
                  thisCorp.channelIds = thisCorp.channelIds.filter(
                    (c) => c != channelId
                  );
                  await data.save();
                }
              }
            }
          } catch (error) {
            if (error instanceof DiscordAPIError && error.code === 50001) {
              LOGGER.warning(
                'Failed to check permissions for channel ' +
                  channelId +
                  '. Removing channel!'
              );
              thisCorp.channelIds = thisCorp.channelIds.filter(
                (c) => c != channelId
              );
              await data.save();
            }
          }
        }

        try {
          const guild = await client.guilds.fetch(thisCorp.serverId);
          thisCorp.serverName = guild.name;
        } catch (error) {
          if (error instanceof DiscordAPIError && error.code === 10004) {
            LOGGER.warning(
              thisCorp.channelIds.length +
                ' channels found for server ' +
                thisCorp.corpName
            );
            thisCorp.serverId = '';
            await data.save();
            corpIndex++;
            continue;
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
          const notAuthedChars = updatedCorp.members
            .flatMap((m) => m.characters.filter((c) => c.needsReAuth))
            .map((c) => c.characterName);

          if (notAuthedChars.length > 0) {
            LOGGER.info('Not Authed: \n' + notAuthedChars.join('\n'));
          }

          const authedChars = updatedCorp.members
            .flatMap((m) => m.characters.filter((c) => !c.needsReAuth))
            .sort(
              (a, b) =>
                new Date(a.nextNotificationCheck).getTime() -
                new Date(b.nextNotificationCheck).getTime()
            )
            .map((c) => {
              let roleTitle = '';
              if (c.roles?.roles?.includes('Director')) {
                roleTitle = ' (Director)';
              } else if (c.roles?.roles?.includes('Station_Manager')) {
                roleTitle = ' (Manager)';
              }
              const secondsUntilNotificationCheck =
                (new Date(c.nextNotificationCheck).getTime() - Date.now()) /
                1000;
              const secondsUntilStructureCheck =
                (new Date(c.nextStructureCheck).getTime() - Date.now()) / 1000;
              const secondsUntilStarbaseCheck =
                (new Date(c.nextStarbaseCheck).getTime() - Date.now()) / 1000;
              return (
                c.characterName +
                ' ' +
                roleTitle +
                '\tnotifications in ' +
                secondsUntilNotificationCheck +
                ' seconds' +
                '\tstructure checks in ' +
                secondsUntilStructureCheck +
                ' seconds' +
                '\tstarbase checks in ' +
                secondsUntilStarbaseCheck +
                ' seconds'
              );
            })
            .join('\n');

          LOGGER.info('Authed Chars: \n' + authedChars);

          await checkStructuresForCorp(updatedCorp, client);
          await checkStarbasesForCorp(updatedCorp, client);
          await checkNotificationsForCorp(updatedCorp, client);
        }

        client.user?.setActivity(
          `Checking Structures at ${new Date(Date.now()).toUTCString()}`
        );
      }
    } catch (error) {
      // log as error severity
      const msg = error instanceof Error ? error : String(error);
      LOGGER.error(msg);
    }
    corpIndex++;
  } while (true);
}
