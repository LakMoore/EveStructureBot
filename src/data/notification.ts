/*
{
    is_read: true,
    notification_id: 1767889141,
    sender_id: 1000137,
    sender_type: 'corporation',
    text: 'allianceID: 99011699\n' +
      'allianceLinkData:\n' +
      '- showinfo\n' +
      '- 16159\n' +
      '- 99011699\n' +
      'allianceName: We Forsakened Few\n' +
      'armorPercentage: 100.0\n' +
      'charID: 2117375278\n' +
      'corpLinkData:\n' +
      '- showinfo\n' +
      '- 2\n' +
      '- 840323545\n' +
      'corpName: The Forsakened Few\n' +
      'hullPercentage: 100.0\n' +
      'shieldPercentage: 94.98224673480567\n' +
      'solarsystemID: 31001712\n' +
      'structureID: &id001 1039189968644\n' +
      'structureShowInfoData:\n' +
      '- showinfo\n' +
      '- 35835\n' +
      '- *id001\n' +
      'structureTypeID: 35835\n',
    timestamp: '2023-05-03T21:41:00Z',
    type: 'StructureUnderAttack'
  }*/

import { Client, Colors, TextChannel } from "discord.js";
import { GetCharactersCharacterIdNotifications200Ok } from "eve-client-ts";
import { AuthenticatedCorp } from "./data";
import { generateStructureNotificationEmbed } from "../embeds/structureNotification";
import { consoleLog, sendMessage } from "../Bot";
import { generateStarbaseNotificationEmbed } from "../embeds/starbaseNotification";
import { getItemName, getStarbaseName } from "../starbases";

export function getStructureIdFromGenericNotificationText(text?: string) {
  if (text) {
    const part1 = text.split("structureID:");
    const part2 = part1[1].split("\n");
    const part3 = part2[0].split(" ");
    const structId = part3.pop();
    if (structId) {
      return Number(structId);
    }
  }
  return 0;
}

/*  Message has this structure
allianceID: 99012530
corpID: 98691522
moonID: 40439538
solarSystemID: 31001712
typeID: 12235
wants:
- quantity: 800
  typeID: 4247
*/
export function getTowerDetailsFromNotificationText(text?: string) {
  if (text) {
    const part1 = text.split("moonID:");
    const part2 = part1[1].split("solarSystemID:");
    const part3 = part2[1].split("typeID:");
    const part4 = part3[1].split("wants:");
    const part5 = part4[1]?.split("quantity:");
    const part6 = part5[1]?.split("typeID:");

    const moon_id = Number(part2[0]);
    const system_id = Number(part3[0]);
    const starbase_type_id = Number(part4[0]);
    const quantity = part6 ? Number(part6[0]) : undefined;
    const type_id = part6 ? Number(part6[1]) : undefined;

    return {
      moon_id,
      system_id,
      starbase_type_id,
      quantity,
      type_id,
    };
  }
  return {};
}

export const messageTypes = new Map<
  GetCharactersCharacterIdNotifications200Ok.TypeEnum,
  {
    message: string;
    colour: number;
    handler: (
      client: Client<boolean>,
      corp: AuthenticatedCorp,
      note: GetCharactersCharacterIdNotifications200Ok,
      data: { message: string; colour: number }
    ) => Promise<void>;
  }
>();

export function initNotifications() {
  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureUnderAttack,
    {
      message: "STRUCTURE UNDER ATTACK",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionStarted,
    {
      message: "Moon mining extraction started",
      colour: Colors.Blue,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionFinished,
    {
      message: "Moon mining extraction finished",
      colour: Colors.Blue,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingAutomaticFracture,
    {
      message: "Moon mining automatic fracture triggered",
      colour: Colors.Blue,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.MoonminingLaserFired,
    {
      message: "Moon mining laser fired",
      colour: Colors.Blue,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureFuelAlert,
    {
      message: "Structure low on fuel",
      colour: Colors.Yellow,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureDestroyed,
    {
      message: "Structure destroyed",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureLostArmor,
    {
      message: "Structure armor depleated",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureLostShields,
    {
      message: "Structure shields depleated",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureOnline,
    {
      message: "Structure online",
      colour: Colors.Green,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .StructureServicesOffline,
    {
      message: "Structure services offline",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureUnanchoring,
    {
      message: "Structure unanchoring",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureWentHighPower,
    {
      message: "Structure power restored",
      colour: Colors.Green,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureWentLowPower,
    {
      message: "Structure power failed",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.OrbitalAttacked,
    {
      message: "POCO Attacked",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.OrbitalReinforced,
    {
      message: "POCO Re-inforced",
      colour: Colors.Red,
      handler: handleStructureNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.TowerAlertMsg,
    {
      message: "POS Alert",
      colour: Colors.Red,
      handler: handleTowerNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.TowerResourceAlertMsg,
    {
      message: "POS Needs Resources",
      colour: Colors.Red,
      handler: handleTowerNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureAnchoring,
    {
      message: "Structure Anchoring",
      colour: Colors.Yellow,
      handler: handleStructureNotification,
    }
  );
}

async function handleStructureNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharactersCharacterIdNotifications200Ok,
  data: { message: string; colour: number }
) {
  try {
    const channel = client.channels.cache.get(corp.channelId);
    if (channel instanceof TextChannel) {
      const structId = getStructureIdFromGenericNotificationText(note.text);
      const thisStruct = corp.structures.find(
        (struct) => struct.structure_id === structId
      );

      await sendMessage(
        channel,
        {
          embeds: [
            generateStructureNotificationEmbed(
              data.colour,
              data.message,
              note.timestamp,
              thisStruct,
              corp.corpName
            ),
          ],
        },
        `Structure Notification: ${data.message}`
      );
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${data.message}. Body: ${note.text}%n`,
      error
    );
  }
}

async function handleTowerNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharactersCharacterIdNotifications200Ok,
  data: { message: string; colour: number }
) {
  try {
    const channel = client.channels.cache.get(corp.channelId);
    if (channel instanceof TextChannel) {
      const details = getTowerDetailsFromNotificationText(note.text);

      consoleLog("note", note);
      consoleLog("details", details);

      const starbaseName = await getStarbaseName(
        details.system_id,
        details.moon_id
      );

      if (details.quantity && details.type_id) {
        // POS wants something
        const itemName = await getItemName(details.type_id);
        data.message += ". Requires " + details.quantity + " " + itemName;
      }

      await sendMessage(
        channel,
        {
          embeds: [
            generateStarbaseNotificationEmbed(
              data.colour,
              data.message,
              note.timestamp,
              starbaseName,
              corp.corpName,
              details.starbase_type_id
            ),
          ],
        },
        `Structure Notification: ${data.message}`
      );
    }
  } catch (error) {
    consoleLog(
      `An error occured in handleNotification for ${data.message}. Body: ${note.text}%n`,
      error
    );
  }
}
