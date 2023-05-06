import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { Hello } from "./commands/hello";

export const Commands: Command[] = [Auth, Hello];
