import dotenv from 'dotenv';
import { TextChannel } from 'discord.js';

dotenv.config();
const DEBUG = process.env.NODE_ENV === 'development';

export const OUR_GUILD = 'KillFeed by Lak Moore';
export const ERROR_CHANNEL = 'structure-bot-errors';
export const DEV_ROLE = 'Developer';

const SENSITIVE_KEYS = new Set([
  'token',
  'authtoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'authorization',
  'decoded_access_token',
  'secret',
  'password',
]);

export class LogHandler {
  private errorChannel: TextChannel | undefined;
  private devRole: string | undefined;

  public setErrorChannel(channel: TextChannel) {
    this.errorChannel = channel;
  }

  public setDevRole(role: string) {
    this.devRole = role;
  }

  // always just log to console
  public info(message: string) {
    const safeMessage = redactSensitive(message);

    consoleLog(safeMessage);
  }

  // log to console only if DEBUG is true
  public debug(message: string) {
    if (DEBUG) {
      const safeMessage = redactSensitive(message);

      consoleLog(safeMessage);
    }
  }

  // always log to console and to error channel on our Discord server (no ping!)
  public warning(error: Error | string) {
    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else {
      message = error;
    }
    const safeMessage = redactSensitive(message);

    // Log the message to console
    consoleError(safeMessage);

    if (this.errorChannel) {
      // No pings for warnings
      void this.errorChannel.send(safeMessage).catch(() => undefined);
    }
  }

  // always log to console and to error channel on our Discord server
  public error(error: Error | string) {
    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else {
      message = error;
    }

    let safeMessage = redactSensitive(message);

    // Log the message to console
    consoleError(safeMessage);

    if (this.errorChannel) {
      // Add the dev Role
      if (this.devRole) {
        safeMessage = `<@&${this.devRole}>\n${safeMessage}`;
      }
      void this.errorChannel.send(safeMessage).catch(() => undefined);
    }
  }
}

export const LOGGER = new LogHandler();

function redactSensitive(value: any, seen = new WeakSet<object>()): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[REDACTED_JWT]'
      );
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitive(value.message, seen),
      stack: redactSensitive(value.stack, seen),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  const out: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(nestedValue, seen);
    }
  }

  return out;
}

function consoleLog(message?: any, ...optionalParams: any[]) {
  // route basic logs through LOGGER.info so they also go to configured error channel when appropriate
  const safeMessage = redactSensitive(message);
  const safeParams = optionalParams.map((value) => redactSensitive(value));
  console.log(new Date().toISOString() + ': ' + safeMessage, ...safeParams);
}

function consoleError(message: object | string, ...optionalParams: object[]) {
  const safeMessage = redactSensitive(message);
  const safeParams = optionalParams.map((value) => redactSensitive(value));
  console.error(new Date().toUTCString() + ' ' + safeMessage, ...safeParams);
}

// function to convert number of milliseconds into timespan string
export function msToTimeSpan(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  const remainingMilliseconds = milliseconds % 1000;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(days + ' day' + (days == 1 ? '' : 's'));
  }
  if (remainingHours > 0) {
    parts.push(remainingHours + ' hour' + (remainingHours == 1 ? '' : 's'));
  }
  if (remainingMinutes > 0) {
    parts.push(
      remainingMinutes + ' minute' + (remainingMinutes == 1 ? '' : 's')
    );
  }
  if (remainingSeconds > 0) {
    parts.push(
      remainingSeconds + ' second' + (remainingSeconds == 1 ? '' : 's')
    );
  }

  if (parts.length === 0) {
    parts.push(
      remainingMilliseconds +
        ' millisecond' +
        (remainingMilliseconds == 1 ? '' : 's')
    );
  }

  return parts.join(' ');
}
