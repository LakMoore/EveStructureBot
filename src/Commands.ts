import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { Hello } from "./commands/hello";
import { Info } from "./commands/info";

export const Commands: Command[] = [Auth, Hello, Info];
