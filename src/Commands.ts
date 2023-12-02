import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { CheckAuth } from "./commands/checkauth";
import { DebugReprocessAll } from "./commands/debug_reprocess_all";
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
  DebugReprocessAll,
];
