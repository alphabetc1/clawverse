import { Logger } from "tslog";

export function createLogger(name: string) {
  return new Logger({
    name,
    prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}} {{logLevelName}} [{{name}}] ",
    prettyLogTimeZone: "local",
    type: "pretty",
  });
}
