import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { CheckAuth } from "./commands/checkauth";
import { DebugReprocessAll } from "./commands/debug_reprocess_all";
import { Hello } from "./commands/hello";
import { Info } from "./commands/info";
import { Remove } from "./commands/remove";

export const Commands: Command[] = [
  Auth,
  CheckAuth,
  Hello,
  Info,
  Remove,
  DebugReprocessAll,
];
