import {
  Client,
  DiscordAPIError,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import packageJson from '../../package.json';
import { Commands } from '../Commands';
import { data, delay } from '../Bot';
import { checkMembership } from '../EveSSO';
import { initialiseReloadCommandOptions } from '../commands/reload';
import { checkNotificationsForCorp } from '../notifications';
import { checkStarbasesForCorp } from '../starbases';
import { checkStructuresForCorp } from '../structures';
import GuildFinder from '../GuildFinder';
import { LOGGER } from '../Logger';
import type { AuthenticatedCorp } from '../data/data';

const POLL_ATTEMPT_DELAY = 3000;
let corpIndex = 0;

export default async function ready(client: Client) {
  for await (const theseClients of Client.on(client, 'ready')) {
    for (const thisClient of theseClients) {
      if (!thisClient.user || !thisClient.application) {
        return;
      }

      await initialiseReloadCommandOptions();
      await thisClient.application.commands.set(Commands);

      LOGGER.info(`${thisClient.user.username} is online`);

      // locate our guild and error channel and store it in LOGGER
      await GuildFinder.findAndStoreErrorChannel(thisClient);

      await announceUpdateToSubscribedChannels(thisClient);

      LOGGER.warning(
        'Starting polling for structures, starbases and notifications...'
      );

      await startPolling(thisClient);
    }
  }
}

async function startPolling(client: Client) {
  // infinite loop required
  while (true) {
    try {
      await doOnePoll(client);
    }
    catch (error: unknown) {
      // ESI package throws an unamed object in the following format: { error: string, status: number }
      if (
        typeof error === 'object'
        && error !== null
        && 'error' in error
        && 'status' in error
      ) {
        const esiError = error as { error: string; status: number };
        LOGGER.error(
          `ESI Error: ${esiError.error}, Status: ${esiError.status}`
        );
      }
      else {
        // log as error severity
        LOGGER.error(error instanceof Error ? error : new Error(String(error)));
      }
    }
    corpIndex++;
  }
}

async function checkChannelPermissions(
  thisCorp: AuthenticatedCorp,
  client: Client<boolean>
) {
  for (const channelId of thisCorp.channelIds) {
    try {
      if (await botCantPostToChannel(client, channelId)) {
        LOGGER.warning(
          'No permission to post in a channel on' + thisCorp.serverName
        );
        thisCorp.channelIds = thisCorp.channelIds.filter((c) => c != channelId);
        await data.save();
      }
    }
    catch (error) {
      if (error instanceof DiscordAPIError && error.code === 50001) {
        LOGGER.warning(
          'Failed to check permissions for channel '
            + channelId
            + '. Removing channel!'
        );
        thisCorp.channelIds = thisCorp.channelIds.filter((c) => c != channelId);
        await data.save();
      }
    }
  }
}

/**
 * Returns the current version identifier as `version:<semver>`.
 */
function getCurrentBuildId(): string {
  return `version:${packageJson.version}`;
}

/**
 * Sends the update announcement to all configured channels and records the current build id.
 */
async function announceUpdateToSubscribedChannels(client: Client) {
  const currentBuildId = getCurrentBuildId();
  if (data.lastUpdateAnnouncement === currentBuildId) {
    LOGGER.debug(
      'Skipping update announcement because the build id has not changed.'
    );
    return;
  }

  const channelIds = [
    // Send one announcement per subscribed channel, even if multiple corps share it.
    ...new Set(data.authenticatedCorps.flatMap((corp) => corp.channelIds)),
  ];
  if (channelIds.length === 0) {
    LOGGER.debug(
      'Skipping update announcement because no channels are configured.'
    );
    return;
  }

  LOGGER.warning('Announcing bot update to subscribed channels...');

  let announcedToAnyChannel = false;
  let allAnnouncementsSucceeded = true;

  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel instanceof TextChannel) {
        announcedToAnyChannel = true;
        await channel.send(
          'EveStructureBot has been updated! Join the Eve Apps by Lak Moore Discord to learn more: https://discord.gg/9xgRvQf5A'
        );
      }
      else {
        allAnnouncementsSucceeded = false;
      }
    }
    catch (error) {
      allAnnouncementsSucceeded = false;
      LOGGER.warning(
        `Failed to send update announcement to channel ${channelId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (!announcedToAnyChannel) {
    LOGGER.debug(
      'Skipping update announcement persistence because no text channels were available.'
    );
    return;
  }

  if (!allAnnouncementsSucceeded) {
    LOGGER.warning(
      'Update announcement was not sent to every subscribed channel; will retry on the next restart.'
    );
    return;
  }

  data.lastUpdateAnnouncement = currentBuildId;
  await data.save();
}

async function getServerNameForCorp(
  thisCorp: AuthenticatedCorp,
  client: Client<boolean>
) {
  try {
    const guild = await client.guilds.fetch(thisCorp.serverId);
    thisCorp.serverName = guild.name;
    return true;
  }
  catch (error) {
    if (error instanceof DiscordAPIError && error.code === 10004) {
      LOGGER.warning(
        thisCorp.channelIds.length
          + ' channels found for server '
          + thisCorp.corpName
      );
      thisCorp.serverId = '';
      await data.save();
    }
  }
  return false;
}

async function getNextCorpToPoll() {
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

  return availableCorps[corpIndex];
}

// Returns true if the bot cannot post to the channel, false if it can.
async function botCantPostToChannel(
  client: Client<boolean>,
  channelId: string
) {
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
        return true;
      }
      // channel is a text channel, bot exists and has permission to view and send messages
      return false;
    }
  }
  return true;
}

async function doOnePoll(client: Client<boolean>) {
  const thisCorp = await getNextCorpToPoll();

  if (thisCorp) {
    await checkChannelPermissions(thisCorp, client);
    await getServerNameForCorp(thisCorp, client);
    // Use Corp members list rather than player's corp
    await checkMembership(client, thisCorp);

    // checkMembership could delete the corp if it has no members
    if (
      !thisCorp.serverName
      || thisCorp.members.length == 0
      || thisCorp.channelIds.length == 0
    ) {
      return;
    }

    await checkStructuresForCorp(thisCorp, client);
    await checkStarbasesForCorp(thisCorp, client);
    await checkNotificationsForCorp(thisCorp, client);

    client.user?.setActivity(
      `${new Date(Date.now()).toLocaleString(
        'en-GB',
        {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }
      )}: checking structures...`
    );
  }
}
