import { Client } from "discord.js";
import { Commands } from "../Commands";
import { consoleLog, data, delay } from "../Bot";
import { checkNotificationsForCorp, checkStructuresForCorp } from "../EveSSO";

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
    if (thisCorp) {
      await checkStructuresForCorp(thisCorp, client);
    }
    const updatedCorp = data.authenticatedCorps[corpIndex];
    if (updatedCorp) {
      await checkNotificationsForCorp(updatedCorp, client);
    }
  } catch (error: any) {
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
