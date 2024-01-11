import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { CheckAuth } from "./commands/checkauth";
import { DebugReprocess } from "./commands/debug_reprocess";
import { Fuel } from "./commands/fuel";
import { Hello } from "./commands/hello";
import { Info } from "./commands/info";
import { Reload } from "./commands/reload";
import { Remove } from "./commands/remove";

export const Commands: Command[] = [
  Auth,
  CheckAuth,
  Fuel,
  Hello,
  Info,
  Remove,
  Reload,
  DebugReprocess,
];
