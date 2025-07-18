import { Command } from "./Command";
import { Auth } from "./commands/auth";
import { CheckAuth } from "./commands/checkauth";
import { DebugReprocess } from "./commands/debug_reprocess";
import { Fuel } from "./commands/fuel";
import { Hello } from "./commands/hello";
import { Info } from "./commands/info";
import { Refuel } from "./commands/refuel";
import { Reload } from "./commands/reload";
import { Remove } from "./commands/remove";
import { SetPing } from "./commands/set_ping";
import { WhoIs } from "./commands/whois";
import { Configure } from "./commands/configure";
import { Test } from "./commands/test";

export const Commands: Command[] = [
  Auth,
  CheckAuth,
  Configure,
  Fuel,
  Hello,
  Info,
  Refuel,
  Remove,
  Reload,
  SetPing,
  Test,
  DebugReprocess,
  WhoIs,
];
