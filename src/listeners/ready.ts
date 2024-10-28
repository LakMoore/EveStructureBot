import { Client } from "discord.js";
import { Commands } from "../Commands";
import { consoleLog, data, delay } from "../Bot";
import { checkMembership, checkNotificationsForCorp } from "../EveSSO";
import { checkStarbasesForCorp } from "../starbases";
import { checkStructuresForCorp } from "../structures";

const POLL_ATTEMPT_DELAY = 5000;
let corpIndex = 0;

export default (client: Client): void => {
  client.on("ready", async () => {
    if (!client.user || !client.application) {
      return;
    }

    await client.application.commands.set(Commands);

    consoleLog(`${client.user.username} is online`);

    setTimeout(() => {
      pollNextCorp(client).catch((err) => {
        consoleLog("Error in pollNextCorp setTimeout()", err);
      });
    }, POLL_ATTEMPT_DELAY);
  });
};

async function pollNextCorp(client: Client) {
  try {
    if (corpIndex < 0 || corpIndex > data.authenticatedCorps.length - 1)
      corpIndex = 0;

    // consoleLog(
    //   `Poll index: ${corpIndex} - Corp Count: ${data.authenticatedCorps.length}`
    // );
    const thisCorp = data.authenticatedCorps[corpIndex];

    // Use Corp members list rather than player's corp
    await checkMembership(client, thisCorp);

    if (thisCorp) {
      await checkStructuresForCorp(thisCorp, client);
      await checkStarbasesForCorp(thisCorp, client);
    }
    const updatedCorp = data.authenticatedCorps[corpIndex];
    if (updatedCorp) {
      await checkNotificationsForCorp(updatedCorp, client);
    }

    client.user?.setActivity(
      `Checking Structures at ${new Date(Date.now()).toUTCString()}`
    );
  } catch (error) {
    consoleLog("An error occured in main loop", error);
  }

  corpIndex++;

  await delay(POLL_ATTEMPT_DELAY);

  // infinite loop required
  setTimeout(() => {
    pollNextCorp(client).catch((err) => {
      consoleLog("Error in pollNextCorp setTimeout()", err);
    });
  }, 1);
}
