import { EmbedBuilder } from "discord.js";
import { AuthenticatedCorp, AuthenticatedCharacter } from "../data/data";
import { NOTIFICATION_CHECK_DELAY, STRUCTURE_CHECK_DELAY } from "../Bot";

export function generateCorpDetailsEmbed(thisCorp: AuthenticatedCorp) {
  const allChars: AuthenticatedCharacter[] = Array.prototype.concat(
    thisCorp.members.flatMap((m) => m.characters)
  );
  const chars = allChars.filter((c) => !c.needsReAuth);
  const needReauth = allChars.filter((c) => c.needsReAuth);

  const fields = [];

  let authed = `Tracking ${chars.length} authorised character${
    chars.length == 1 ? "" : "s"
  }.`;

  if (chars.length > 0) {
    for (const c of chars) {
      authed += `\n${c.characterName}`;
    }
  }

  fields.push({
    name: "\u200b",
    value: authed,
  });

  if (chars.length > 0) {
    const frequencies = `Checking notifications every ${
      Math.round(NOTIFICATION_CHECK_DELAY / (6000 * chars.length)) / 10
    } minutes.
Checking stucture status every ${
      Math.round(STRUCTURE_CHECK_DELAY / (6000 * chars.length)) / 10
    } minutes.`;

    fields.push({
      name: "\u200b",
      value: frequencies,
    });
  }

  if (chars.length < 10) {
    fields.push({
      name: "\u200b",
      value: `Recommend authorising at least ${
        10 - chars.length
      } more characters!`,
    });
  }

  if (needReauth.length > 0) {
    fields.push({
      name: "\u200b",
      value: `${needReauth.length} character ${
        needReauth.length == 1 ? "" : "s"
      } need${
        needReauth.length == 1 ? "s" : ""
      } to be re-authorised\n(use /checkauth for details)`,
    });
  }

  fields.push({
    name: "\u200b",
    value: `Corporation has ${thisCorp.structures.length} structure${
      thisCorp.structures.length == 1 ? "" : "s"
    }.`,
  });

  return new EmbedBuilder()
    .setColor(0x0000ff)
    .setTitle(thisCorp.corpName)
    .setThumbnail(
      `https://images.evetech.net/corporations/${thisCorp.corpId}/logo?size=64`
    )
    .addFields(fields);
}
