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

import { GetCharactersCharacterIdNotifications200Ok } from "eve-client-ts";

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

export function isAttackNotification(
  note: GetCharactersCharacterIdNotifications200Ok
) {
  return (
    note.type ==
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.StructureUnderAttack
  );
}

export function isMoonMiningExtractionStartedNotification(
  note: GetCharactersCharacterIdNotifications200Ok
) {
  return (
    note.type ==
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionStarted
  );
}

export function isMoonMiningExtractionFinishedNotification(
  note: GetCharactersCharacterIdNotifications200Ok
) {
  return (
    note.type ==
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingExtractionFinished
  );
}

export function isMoonMiningAutoFractureNotification(
  note: GetCharactersCharacterIdNotifications200Ok
) {
  return (
    note.type ==
    GetCharactersCharacterIdNotifications200Ok.TypeEnum
      .MoonminingAutomaticFracture
  );
}

export function isMoonMiningLaserFiredNotification(
  note: GetCharactersCharacterIdNotifications200Ok
) {
  return (
    note.type ==
    GetCharactersCharacterIdNotifications200Ok.TypeEnum.MoonminingLaserFired
  );
}
