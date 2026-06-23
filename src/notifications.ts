import { Client } from 'discord.js';
import { NOTIFICATION_CHECK_DELAY, data } from './Bot';
import { AuthenticatedCorp } from './data/data';
import { messageTypes } from './data/notification';
import { getWorkingChars, getAccessToken } from './EveSSO';
import { EsiClient } from '@localisprimary/esi/dist/client';
import { GetCharacterNotificationsResponse } from '@localisprimary/esi/dist/types';
import { LOGGER } from './Logger';

export async function checkNotificationsForCorp(
  corp: AuthenticatedCorp,
  client: Client
) {
  LOGGER.info('checkNotificationsForCorp ' + corp.corpName);

  const workingChars = getWorkingChars(
    corp,
    corp.nextNotificationCheck,
    (c) => c.nextNotificationCheck,
    // POS notifications are only sent to Directors so checking other roles actually slows down POS checks
    'Director'
  );

  if (!workingChars || workingChars.length == 0) {
    LOGGER.info('No available characters to check notifications with!');
    return;
  }

  const thisChar = workingChars[0];

  if (!thisChar || new Date(thisChar.nextNotificationCheck) > new Date()) {
    LOGGER.info(
      thisChar.characterName + ' is not ready to check notifications!'
    );
    return;
  }

  const token = await getAccessToken(thisChar);
  if (!token) {
    LOGGER.info('No access token for character ' + thisChar.characterName);
    return;
  }

  LOGGER.info('Using ' + thisChar.characterName);

  const esi = new EsiClient({
    userAgent: 'EveStructureBot',
    token,
  });
  const { data: notifications } = await esi.getCharacterNotifications({
    character_id: thisChar.characterId,
  });

  // mark this character so we don't use it to check again too soon
  const nextCheck =
    Date.now() + NOTIFICATION_CHECK_DELAY / workingChars.length + 3000;
  thisChar.nextNotificationCheck = new Date(nextCheck);
  corp.nextNotificationCheck = new Date(nextCheck);

  // consoleLog("notifications", notifications);
  // save the notification to a temporary file
  // const fs = require('node:fs');
  // fs.writeFileSync(
  //   'notifications.json',
  //   JSON.stringify(notifications, null, 2)
  // );

  // Get the notifications that we have not seen previously
  const selectedNotifications = notifications
    .filter(
      (note) => new Date(note.timestamp) > new Date(corp.mostRecentNotification)
    )
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const newDate = await processNotifications(
    selectedNotifications,
    client,
    corp
  );
  corp.mostRecentNotification = newDate;

  await data.save();
}

export async function processNotifications(
  selectedNotifications: GetCharacterNotificationsResponse,
  client: Client<boolean>,
  corp: AuthenticatedCorp
) {
  let mostRecentNotification = new Date(corp.mostRecentNotification);

  const missingTypes: string[] = [];

  for (const notification of selectedNotifications) {
    const data = messageTypes.get(notification.type);
    if (data) {
      if (process.env.NODE_ENV === 'development') {
        LOGGER.info('Handling notification ' + JSON.stringify(notification));
      }
      try {
        await data.handler(
          client,
          corp,
          notification,
          data.message,
          data.colour,
          data.get_role_to_mention,
          data.structureStateMessage,
          data.structureFuelMessage,
          data.miningUpdatesMessage
        );
      } catch (err) {
        const payload = {
          note: notification,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : String(err),
        };
        LOGGER.error(new Error(JSON.stringify(payload, null, 2)));
      }
      const thisDate = new Date(notification.timestamp);
      if (thisDate > mostRecentNotification) {
        mostRecentNotification = thisDate;
      }
    } else if (missingTypes.length < 3) {
      // avoid spamming the logs with missing types
      LOGGER.warning('No handler for message ' + JSON.stringify(notification));
      missingTypes.push(notification.type);
    }
  }

  return mostRecentNotification;
}
