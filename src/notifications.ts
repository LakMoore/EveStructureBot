import { Client, HTTPError } from "discord.js";
import { GetCharactersCharacterIdRolesOk, CharacterApiFactory, GetCharactersCharacterIdNotifications200Ok } from "eve-client-ts";
import { consoleLog, NOTIFICATION_CHECK_DELAY, data } from "./Bot";
import { AuthenticatedCorp } from "./data/data";
import { messageTypes } from "./data/notification";
import { getWorkingChars, getAccessToken } from "./EveSSO";
import { logWarning, logErrorLevel } from "./errorLogger";


export async function checkNotificationsForCorp(
    corp: AuthenticatedCorp,
    client: Client
) {
    consoleLog("checkNotificationsForCorp ", corp.corpName);

    // POS notifications are only sent to Directors so checking other roles actually slows down POS checks
    const workingChars = getWorkingChars(
        corp,
        corp.nextNotificationCheck,
        (c) => c.nextNotificationCheck,
        GetCharactersCharacterIdRolesOk.RolesEnum.Director
    );

    if (!workingChars || workingChars.length == 0) {
        consoleLog("No available characters to check notifications with!");
        return;
    }

    const thisChar = workingChars[0];

    if (!thisChar || new Date(thisChar.nextNotificationCheck) > new Date()) {
        consoleLog(thisChar.characterName + " is not ready to check notifications!");
        return;
    }

    const config = await getAccessToken(thisChar);
    if (!config) {
        consoleLog("No access token for character " + thisChar.characterName);
        return;
    }

    consoleLog("Using " + thisChar.characterName);

    try {
        const notifications = await CharacterApiFactory(
            config
        ).getCharactersCharacterIdNotifications(thisChar.characterId);

        // mark this character so we don't use it to check again too soon
        const nextCheck = Date.now() + (NOTIFICATION_CHECK_DELAY / workingChars.length) + 3000;
        thisChar.nextNotificationCheck = new Date(nextCheck);
        corp.nextNotificationCheck = new Date(nextCheck);

        // consoleLog("notifications", notifications);
        // // save the notification to a temporary file
        // const fs = require("fs");
        // fs.writeFileSync(
        //   "notifications.json",
        //   JSON.stringify(notifications, null, 2)
        // );
        // Get the notifications that we have not seen previously
        const selectedNotifications = notifications.filter(
            (note) => new Date(note.timestamp) > new Date(corp.mostRecentNotification)
        );

        const newDate = await processNotifications(selectedNotifications, client, corp);
        corp.mostRecentNotification = newDate;

        await data.save();
    } catch (error: any) {
        // if 401 Unauthorized then mark this character as needing reauth
        if (error.status === 401) {
            thisChar.needsReAuth = true;
            thisChar.authFailedAt = new Date();
            await data.save();
            logWarning("Unauthorised! Marked " + thisChar.characterName + " as needing reauth.");
        }
        else {
            logErrorLevel("Error checking notifications for corp " + corp.corpName, error);
        }
    }
}

export async function processNotifications(
    selectedNotifications: GetCharactersCharacterIdNotifications200Ok[],
    client: Client<boolean>,
    corp: AuthenticatedCorp
) {
    let mostRecentNotification = new Date(corp.mostRecentNotification);

    for (const notification of selectedNotifications) {
        const data = messageTypes.get(notification.type);
        if (data) {
            if (process.env.NODE_ENV === "development") {
                consoleLog("Handling notification", notification);
            }
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
        } else {
            consoleLog("No handler for message", notification);
        }

        const thisDate = new Date(notification.timestamp);
        if (thisDate > mostRecentNotification) {
            mostRecentNotification = thisDate;
        }
    }

    return mostRecentNotification;
}
