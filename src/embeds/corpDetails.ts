import { EmbedBuilder } from "discord.js";
import { AuthenticatedCorp, AuthenticatedCharacter } from "../data/data";
import { NOTIFICATION_CHECK_DELAY, STRUCTURE_CHECK_DELAY } from "../Bot";
import { GetCharactersCharacterIdRolesOk } from "eve-client-ts";

export function generateCorpDetailsEmbed(thisCorp: AuthenticatedCorp) {
  const allChars: AuthenticatedCharacter[] = Array.prototype.concat(
    thisCorp.members.flatMap((m) => m.characters)
  );
  const chars = allChars.filter((c) => !c.needsReAuth);
  const needReauth = allChars.filter((c) => c.needsReAuth);
  const directors = chars.filter((c) => c.roles?.includes(GetCharactersCharacterIdRolesOk.RolesEnum.Director));
  const stationManagers = chars.filter((c) => c.roles?.includes(GetCharactersCharacterIdRolesOk.RolesEnum.StationManager));

  const fields = [];

  let authed = `Tracking ${chars.length} authorised character${chars.length == 1 ? "" : "s"
    }.`;

  if (chars.length > 0) {
    for (const c of chars) {
      authed += `\n${c.characterName}${directors.includes(c) ? " (Director)" : stationManagers.includes(c) ? " (Station Manager)" : ""}`;
    }
  }

  fields.push({
    name: "\u200b",
    value: authed,
  });

  const notificationTime = Math.round(NOTIFICATION_CHECK_DELAY / (6000 * directors.length)) / 10;
  const structureTime = Math.round(STRUCTURE_CHECK_DELAY / (6000 * stationManagers.length)) / 10;
  const posTime = Math.round(STRUCTURE_CHECK_DELAY / (6000 * directors.length)) / 10;

  const notificationMessage = directors.length == 0 ? "No directors found. Unable to check Notifications!" : `${directors.length} director${directors.length == 1 ? "" : "s"}; checking notifications every ${notificationTime} minute${notificationTime == 1 ? "" : "s"}.`;
  const structureMessage = stationManagers.length == 0 ? "No station managers found. Unable to check Structure Status!" : `${stationManagers.length} station manager${stationManagers.length == 1 ? "" : "s"}; checking stucture status every ${structureTime} minute${structureTime == 1 ? "" : "s"}.`;
  const posMessage = directors.length == 0 ? "No directors found. Unable to check POS Status!" : `${directors.length} director${directors.length == 1 ? "" : "s"}; checking POS status every ${posTime} minute${posTime == 1 ? "" : "s"}.`;

  fields.push({
    name: "\u200b",
    value: `${notificationMessage}\n${structureMessage}\n${posMessage}`,
  });

  if (chars.length < 10) {
    fields.push({
      name: "\u200b",
      value: `Recommend authorising at least ${10 - directors.length} more director${10 - directors.length == 1 ? "" : "s"}!`,
    });
  }

  if (needReauth.length > 0) {
    fields.push({
      name: "\u200b",
      value: `${needReauth.length} character${needReauth.length == 1 ? "" : "s"} need${needReauth.length == 1 ? "s" : ""} to be re-authorised\n(use /checkauth for details)`,
    });
  }

  fields.push({
    name: "\u200b",
    value: `Corporation has ${thisCorp.structures.length} structure${thisCorp.structures.length == 1 ? "" : "s"}.`,
  });

  return new EmbedBuilder()
    .setColor(0x0000ff)
    .setTitle(thisCorp.corpName)
    .setThumbnail(
      `https://images.evetech.net/corporations/${thisCorp.corpId}/logo?size=64`
    )
    .addFields(fields);
}
