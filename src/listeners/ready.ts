import { Client } from "discord.js";
import { Commands } from "../Commands";
import { data, delay } from "../Bot";
import { checkNotificationsForCorp, checkStructuresForCorp } from "../EveSSO";

const POLL_ATTEMPT_DELAY = 1000;
let corpIndex = 0;

export default (client: Client): void => {
  client.on("ready", async () => {
    if (!client.user || !client.application) {
      return;
    }

    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);

    setTimeout(() => pollNextCorp(client), POLL_ATTEMPT_DELAY);
  });
};

async function pollNextCorp(client: Client) {
  if (corpIndex < 0 || corpIndex > data.authenticatedCorps.length - 1)
    corpIndex = 0;

  console.log(
    `Poll index: ${corpIndex} - Corp Count: ${data.authenticatedCorps.length}`
  );
  const thisCorp = data.authenticatedCorps[corpIndex];
  if (thisCorp) {
    await checkStructuresForCorp(thisCorp, client);
    await checkNotificationsForCorp(thisCorp, client);
  }
  corpIndex++;

  await delay(POLL_ATTEMPT_DELAY);

  // infinite loop required
  setTimeout(() => pollNextCorp(client), 1);
}
