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
import {
  getAllianceName,
  getCharacterName,
  getCorpName,
  getItemName,
  getStarbaseName,
} from "../starbases";

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
    const moon_id = getValueFromNotificationText(text, "moonID:");
    const system_id = getValueFromNotificationText(text, "solarSystemID:");
    const starbase_type_id = getValueFromNotificationText(text, "typeID:");
    const quantity = getValueFromNotificationText(text, "- quantity:");
    const type_id = getValueFromNotificationText(text, "  typeID:");
    const aggressor_alliance_id = getValueFromNotificationText(
      text,
      "aggressorAllianceID:"
    );
    const aggressor_corp_id = getValueFromNotificationText(
      text,
      "aggressorCorpID:"
    );
    const aggressor_id = getValueFromNotificationText(text, "aggressorID:");
    const armor_value = getValueFromNotificationText(text, "armorValue:");
    const hull_value = getValueFromNotificationText(text, "hullValue:");
    const shield_value = getValueFromNotificationText(text, "shieldValue:");

    return {
      moon_id,
      system_id,
      starbase_type_id,
      quantity,
      type_id,
      aggressor_alliance_id,
      aggressor_corp_id,
      aggressor_id,
      armor_value,
      hull_value,
      shield_value,
    };
  }
  return {};
}

function getValueFromNotificationText(text: string, key: string) {
  if (text) {
    const parts = text.split(key);
    if (parts?.length > 1) {
      const result = parts[1].split("\n");
      if (result?.length > 0) {
        return Number(result[0]);
      }
    }
  }
  return 0;
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

      const starbaseName = await getStarbaseName(
        details.system_id,
        details.moon_id
      );

      let message = data.message;

      if (details.quantity && details.type_id) {
        // POS wants something
        const itemName = await getItemName(details.type_id);
        message += "\nRequires " + details.quantity + " " + itemName;
      }

      if (details.aggressor_id) {
        // POS under attack
        const corpName = await getCorpName(details.aggressor_corp_id);
        const aggressorName = await getCharacterName(details.aggressor_id);
        message +=
          `Under attack by [${aggressorName}](https://zkillboard.com/character/${details.aggressor_id}/)([${corpName}](https://zkillboard.com/corporation/${details.aggressor_corp_id}/))%n` +
          `Shields: ${formatNumberToPercent1DP(details.shield_value)}%n` +
          `Armor: ${formatNumberToPercent1DP(details.armor_value)}%n` +
          `Hull: ${formatNumberToPercent1DP(details.hull_value)}%n`;
      }

      consoleLog("note", note);
      consoleLog("details", details);

      await sendMessage(
        channel,
        {
          embeds: [
            generateStarbaseNotificationEmbed(
              data.colour,
              message,
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

// return number to 1 decimal place
function formatNumberToPercent1DP(num: number) {
  return `${Math.round(num * 1000) / 10}%`;
}
