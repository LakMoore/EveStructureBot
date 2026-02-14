import { Client, TextChannel } from "discord.js";

export enum ErrorLevel {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error"
}

// Reference to the error channel
let errorChannel: TextChannel | null = null;
let client: Client | null = null;

/**
 * Initialize the error logger with the Discord client.
 * This should be called during bot startup.
 */
export function initErrorLogger(discordClient: Client) {
  client = discordClient;
  
  // Try to find the error channel if ERROR_CHANNEL_ID is set
  const errorChannelId = process.env.ERROR_CHANNEL_ID;
  if (errorChannelId && client.channels) {
    try {
      const channel = client.channels.cache.get(errorChannelId);
      if (channel instanceof TextChannel) {
        errorChannel = channel;
        console.log(new Date().toISOString() + ": Error channel initialized: " + channel.name);
      } else {
        console.log(new Date().toISOString() + ": ERROR_CHANNEL_ID is not a text channel");
      }
    } catch (error) {
      console.log(new Date().toISOString() + ": Failed to initialize error channel: " + error);
    }
  }
}

/**
 * Set the error channel reference. This can be called after the channel is found
 * during guild enumeration.
 */
export function setErrorChannel(channel: TextChannel) {
  errorChannel = channel;
  console.log(new Date().toISOString() + ": Error channel set to: " + channel.name + " in " + channel.guild.name);
}

/**
 * Get the current error channel (for testing/debugging)
 */
export function getErrorChannel(): TextChannel | null {
  return errorChannel;
}

/**
 * Log a message with the specified error level.
 * Logs to console and optionally to Discord error channel.
 * 
 * @param level The severity level of the error
 * @param message The main error message
 * @param optionalParams Additional parameters to log
 */
function log(level: ErrorLevel, message: any, ...optionalParams: any[]) {
  // Always log to console
  const timestamp = new Date().toISOString();
  const levelPrefix = `[${level.toUpperCase()}]`;
  console.log(`${timestamp}: ${levelPrefix} ${message}`, ...optionalParams);
  
  // Send to Discord error channel if available
  if (errorChannel && client) {
    sendToDiscordChannel(level, message, optionalParams);
  }
}

/**
 * Send an error message to the Discord error channel
 */
async function sendToDiscordChannel(level: ErrorLevel, message: any, optionalParams: any[]) {
  if (!errorChannel) return;
  
  try {
    // Format the message for Discord
    let discordMessage = "";
    
    // Add notification for ERROR level
    if (level === ErrorLevel.ERROR) {
      discordMessage = "@everyone\n";
    }
    
    // Add level indicator with emoji
    const emoji = getLevelEmoji(level);
    discordMessage += `${emoji} **${level.toUpperCase()}**\n`;
    
    // Add timestamp
    discordMessage += `<t:${Math.floor(Date.now() / 1000)}:F>\n\n`;
    
    // Add the main message
    discordMessage += "```\n";
    discordMessage += formatMessage(message);
    
    // Add optional parameters if present
    if (optionalParams.length > 0) {
      for (const param of optionalParams) {
        discordMessage += "\n" + formatMessage(param);
      }
    }
    discordMessage += "\n```";
    
    // Discord has a 2000 character limit, truncate if needed
    if (discordMessage.length > 1900) {
      discordMessage = discordMessage.substring(0, 1900) + "\n... (truncated)\n```";
    }
    
    await errorChannel.send(discordMessage);
  } catch (error) {
    // If we fail to send to Discord, just log to console
    console.error(new Date().toISOString() + ": Failed to send error to Discord channel:", error);
  }
}

/**
 * Get emoji for error level
 */
function getLevelEmoji(level: ErrorLevel): string {
  switch (level) {
    case ErrorLevel.INFO:
      return "ℹ️";
    case ErrorLevel.WARNING:
      return "⚠️";
    case ErrorLevel.ERROR:
      return "🚨";
    default:
      return "📝";
  }
}

/**
 * Format a message for Discord (handle objects, errors, etc.)
 */
function formatMessage(message: any): string {
  if (message === null) return "null";
  if (message === undefined) return "undefined";
  
  if (message instanceof Error) {
    let errorStr = message.name + ": " + message.message;
    if (message.stack) {
      errorStr += "\n" + message.stack;
    }
    return errorStr;
  }
  
  if (typeof message === "object") {
    try {
      return JSON.stringify(message, null, 2);
    } catch (e) {
      return String(message);
    }
  }
  
  return String(message);
}

/**
 * Convenience functions for each log level
 */
export function logInfo(message: any, ...optionalParams: any[]) {
  log(ErrorLevel.INFO, message, ...optionalParams);
}

export function logWarning(message: any, ...optionalParams: any[]) {
  log(ErrorLevel.WARNING, message, ...optionalParams);
}

export function logError(message: any, ...optionalParams: any[]) {
  log(ErrorLevel.ERROR, message, ...optionalParams);
}
