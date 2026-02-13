# Error Logging System

This document describes the centralized error logging system implemented for the Eve Structure Bot.

## Overview

The error logging system provides a centralized way to log errors, warnings, and informational messages throughout the bot. All logs are written to the console and optionally sent to a designated Discord error channel.

## Configuration

To enable Discord error channel logging, add the following to your `.env` file:

```
ERROR_CHANNEL_ID="your_channel_id_here"
```

To find your channel ID:
1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click on the channel you want to use for errors
3. Select "Copy Channel ID"
4. Paste the ID into your `.env` file

## Error Levels

The system supports three error levels:

- **INFO** (ℹ️): Informational messages, general status updates
- **WARNING** (⚠️): Non-critical issues that should be monitored
- **ERROR** (🚨): Critical errors that require immediate attention (pings @everyone)

## Usage

Import the error logging functions in your file:

```typescript
import { logInfo, logWarning, logErrorLevel } from "./errorLogger";
```

### Examples

```typescript
// Log informational message
logInfo("Bot started successfully");

// Log warning
logWarning("Failed to fetch data, retrying...", retryCount);

// Log critical error (will ping @everyone in Discord)
logErrorLevel("Critical database connection failure", error);
```

## Features

- **Dual Logging**: All messages are logged to both console and Discord (if configured)
- **Automatic Formatting**: Errors, objects, and other data types are automatically formatted
- **Truncation**: Long messages are automatically truncated to fit Discord's 2000 character limit
- **@everyone Ping**: ERROR level messages include @everyone notification in Discord
- **Timestamps**: All messages include ISO timestamps in console and Discord timestamps
- **Error Details**: Stack traces and error details are preserved

## Testing

A test command `/test_error_logging` is available to verify the error logging system:

```
/test_error_logging
```

This command will send test messages at all three error levels to the error channel.

## Implementation Details

### Initialization

The error logger is initialized during bot startup in `Bot.ts`:

1. Bot logs in to Discord
2. `initErrorLogger(client)` is called to set up the error logger
3. During the `ready` event, the bot fetches the error channel using `ERROR_CHANNEL_ID`
4. The channel reference is stored for future use

### Error Channel Discovery

The error channel is discovered during bot startup in `ready.ts`:
- The bot enumerates all channels it has access to
- If `ERROR_CHANNEL_ID` is set in environment variables, it fetches that specific channel
- The channel reference is stored in the error logger module

### Message Format

Discord error messages follow this format:

```
@everyone (only for ERROR level)
🚨 **ERROR**
<Discord timestamp>

```
<error message>
<optional parameters>
```
```

## Migration from consoleLog

All error handling throughout the codebase has been updated to use the centralized error logger instead of `consoleLog` for error messages:

- `Bot.ts` - Main error handler
- `listeners/ready.ts` - Polling loop errors
- `listeners/interactionCreate.ts` - Command execution errors
- `structures.ts` - Structure checking errors
- `notifications.ts` - Notification processing errors
- `starbases.ts` - Starbase checking errors
- `EveSSO.ts` - Authentication errors
- `data/data.ts` - Data persistence errors
- `data/notification.ts` - Notification handling errors

Regular informational logging still uses `consoleLog()` for backwards compatibility.
