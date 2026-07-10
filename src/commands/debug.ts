import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Message,
  TextChannel,
} from 'discord.js';
import { Command } from '../Command';
import { colours, data } from '../Bot';
import {
  AuthenticatedCharacter,
  AuthenticatedCorp,
  CorpMember,
} from '../data/data';

const DEBUG_UPDATE_INTERVAL_MS = 7000;
const STOP_BUTTON_ID = 'debug_stop';

type CheckType = 'notifications' | 'starbases' | 'structures';
type RequiredRole = 'Director' | 'Station_Manager' | undefined;

type DebugSession = {
  message: Message;
  interval: ReturnType<typeof setInterval>;
};

type CheckStatus = {
  nextCheckSeconds: number;
  nextCharacterSeconds: number | null;
  nextCharacterName: string | null;
};

const debugSessions = new Map<string, DebugSession>();

function getStopButtonRow() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(STOP_BUTTON_ID)
        .setLabel('Turn Debug Mode Off')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function flattenCharacters(members: CorpMember[]) {
  return members.flatMap((member) => member.characters);
}

function getSecondsUntil(time: Date) {
  const msUntil = new Date(time).getTime() - Date.now();

  if (Number.isNaN(msUntil)) {
    return 0;
  }

  return Math.max(0, Math.ceil(msUntil / 1000));
}

function getEligibleCharacters(
  corp: AuthenticatedCorp,
  requiredRole: RequiredRole
): AuthenticatedCharacter[] {
  return flattenCharacters(corp.members)
    .filter(
      (character) =>
        !character.needsReAuth
        && (
          requiredRole === undefined
          || Boolean((character as any).roleMap?.[requiredRole])
          || character.roles?.roles?.includes(requiredRole)
        )
    )
    .sort((left, right) =>
      left.characterName.localeCompare(right.characterName)
    );
}

function getCheckStatus(
  corp: AuthenticatedCorp,
  checkType: CheckType
): CheckStatus {
  let nextCheck = corp.nextNotificationCheck;
  let getCharacterCheck = (character: AuthenticatedCharacter) =>
    character.nextNotificationCheck;
  let requiredRole: RequiredRole = 'Director';

  if (checkType === 'starbases') {
    nextCheck = corp.nextStarbaseCheck;
    getCharacterCheck = (character: AuthenticatedCharacter) =>
      character.nextStarbaseCheck;
  }
  else if (checkType === 'structures') {
    nextCheck = corp.nextStructureCheck;
    getCharacterCheck = (character: AuthenticatedCharacter) =>
      character.nextStructureCheck;
    requiredRole = 'Station_Manager';
  }

  const nextCharacter = getEligibleCharacters(corp, requiredRole).sort(
    (left, right) =>
      new Date(getCharacterCheck(left)).getTime()
      - new Date(getCharacterCheck(right)).getTime()
  )[0];

  return {
    nextCheckSeconds: getSecondsUntil(nextCheck),
    nextCharacterSeconds: nextCharacter
      ? getSecondsUntil(getCharacterCheck(nextCharacter))
      : null,
    nextCharacterName: nextCharacter?.characterName ?? null,
  };
}

function formatCharacterStatus(status: CheckStatus) {
  if (!status.nextCharacterName || status.nextCharacterSeconds === null) {
    return 'no eligible character';
  }

  return `${status.nextCharacterName} in ${status.nextCharacterSeconds}s`;
}

function buildChannelDebugEmbed(channelId: string) {
  const channelCorps = data.authenticatedCorps.filter((corp) =>
    corp.channelIds.includes(channelId)
  );

  const embed = new EmbedBuilder()
    .setColor(colours.green)
    .setTitle('Debug Mode ON')
    .setTimestamp(new Date());

  if (channelCorps.length === 0) {
    embed.setDescription(
      'No tracked corporations are configured for this channel.'
    );
    return embed;
  }

  for (const corp of channelCorps) {
    const notifications = getCheckStatus(corp, 'notifications');
    const starbases = getCheckStatus(corp, 'starbases');
    const structures = getCheckStatus(corp, 'structures');

    embed.addFields({
      name: corp.corpName,
      value: [
        `Notifications: next check in ${
          notifications.nextCheckSeconds
        }s | next character ${formatCharacterStatus(notifications)}`,
        `Starbases: next check in ${
          starbases.nextCheckSeconds
        }s | next character ${formatCharacterStatus(starbases)}`,
        `Structures: next check in ${
          structures.nextCheckSeconds
        }s | next character ${formatCharacterStatus(structures)}`,
      ].join('\n'),
    });
  }

  return embed;
}

async function stopDebugSession(
  channelId: string,
  options?: {
    interaction?: ButtonInteraction;
    message?: Message;
  }
) {
  const session = debugSessions.get(channelId);

  if (!session && !options?.message) {
    if (options?.interaction && !options.interaction.replied) {
      await options.interaction.reply({
        content: 'Debug mode is not active in this channel.',
        ephemeral: true,
      });
    }
    return;
  }

  if (session) {
    clearInterval(session.interval);
    debugSessions.delete(channelId);
  }

  const messageToEdit = options?.message ?? session?.message;
  if (!messageToEdit) {
    return;
  }

  const update = {
    embeds: [
      new EmbedBuilder()
        .setColor(colours.red)
        .setTitle('Debug Mode OFF')
        .setTimestamp(new Date()),
    ],
    components: [],
  };

  if (options?.interaction) {
    await options.interaction.update(update);
    return;
  }

  await messageToEdit.edit(update);
}

function startDebugUpdates(channel: TextChannel, message: Message) {
  const interval = setInterval(
    async () => {
      try {
        await message.edit({
          embeds: [buildChannelDebugEmbed(channel.id)],
          components: getStopButtonRow(),
        });
      }
      catch {
        await stopDebugSession(channel.id);
      }
    },
    DEBUG_UPDATE_INTERVAL_MS
  );

  debugSessions.set(channel.id, { message, interval });
}

export const Debug: Command = {
  name: 'debug',
  description: 'Start channel debug mode.',
  deferReply: false,
  ephemeral: false,
  run: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const channel = interaction.channel;

    if (!(channel instanceof TextChannel)) {
      await interaction.reply({
        content: 'This command can only be used in a text channel.',
        ephemeral: true,
      });
      return;
    }

    const existingSession = debugSessions.get(channel.id);
    if (existingSession) {
      await stopDebugSession(channel.id, { message: existingSession.message });
    }

    await interaction.reply({
      embeds: [buildChannelDebugEmbed(channel.id)],
      components: getStopButtonRow(),
    });

    const message = await interaction.fetchReply();
    startDebugUpdates(channel, message);
  },
  button: async (client: Client, interaction: ButtonInteraction) => {
    if (!(interaction.channel instanceof TextChannel)) {
      await interaction.reply({
        content: 'This button can only be used in a text channel.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId !== STOP_BUTTON_ID) {
      return;
    }

    await stopDebugSession(
      interaction.channel.id,
      {
        interaction,
        message: interaction.message,
      }
    );
  },
};
