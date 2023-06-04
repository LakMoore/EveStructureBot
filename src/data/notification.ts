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

import { Client, Colors, EmbedBuilder } from "discord.js";
import { GetCharactersCharacterIdNotifications200Ok } from "eve-client-ts";
import { AuthenticatedCorp } from "./data";
import { consoleLog, getRelativeDiscordTime } from "../Bot";

export function getStructureIdFromGenericNotificationText(text: string) {
  const part1 = text.split("structureID:");
  const part2 = part1[1].split("\n");
  const part3 = part2[0].split(" ");
  const structId = part3.pop();
  if (structId) {
    return Number(structId);
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
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionStarted,
    {
      message: "Moon mining extraction started",
      colour: Colors.Blue,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionFinished,
    {
      message: "Moon mining extraction finished",
      colour: Colors.Blue,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingAutomaticFracture,
    {
      message: "Moon mining automatic fracture triggered",
      colour: Colors.Blue,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.MoonminingLaserFired,
    {
      message: "Moon mining laser fired",
      colour: Colors.Blue,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureFuelAlert,
    {
      message: "Structure low on fuel",
      colour: Colors.Yellow,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureDestroyed,
    {
      message: "Structure destroyed",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureLostArmor,
    {
      message: "Structure armor depleated",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureLostShields,
    {
      message: "Structure shields depleated",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureOnline,
    {
      message: "Structure online",
      colour: Colors.Green,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .StructureServicesOffline,
    {
      message: "Structure services offline",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureUnanchoring,
    {
      message: "Structure unanchoring",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureWentHighPower,
    {
      message: "Structure power restored",
      colour: Colors.Green,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureWentLowPower,
    {
      message: "Structure power failed",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.OrbitalAttacked,
    {
      message: "POCO Attacked",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.OrbitalReinforced,
    {
      message: "POCO Re-inforced",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.TowerAlertMsg,
    {
      message: "POS Alert",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.TowerResourceAlertMsg,
    {
      message: "POS low on fuel",
      colour: Colors.Red,
      handler: handleNotification,
    }
  );

  messageTypes.set(
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureAnchoring,
    {
      message: "Structure Anchoring",
      colour: Colors.Yellow,
      handler: handleNotification,
    }
  );
}

async function handleNotification(
  client: Client<boolean>,
  corp: AuthenticatedCorp,
  note: GetCharactersCharacterIdNotifications200Ok,
  data: { message: string; colour: number }
) {
  const channel = client.channels.cache.get(corp.channelId);
  if (channel?.isTextBased()) {
    let embed = new EmbedBuilder()
      .setColor(data.colour)
      .setDescription(
        `${data.message}\n${getRelativeDiscordTime(note.timestamp)}`
      );
    let foundStruct = false;
    if (note.text) {
      const structId = getStructureIdFromGenericNotificationText(note.text);
      const thisStruct = corp.structures.find(
        (struct) => struct.structure_id === structId
      );
      if (thisStruct) {
        foundStruct = true;
        embed
          .setTitle(thisStruct.name ?? "unknown structure")
          .setAuthor({ name: corp.corpName })
          .setThumbnail(
            `https://images.evetech.net/types/${thisStruct.type_id}/render?size=64`
          );
      } else {
        consoleLog("Failed to find structure", note);
      }
    }
    if (!foundStruct) {
      embed.setTitle(`Not sure which one!`);
    }
    await channel.send({ embeds: [embed] });
  }
}
