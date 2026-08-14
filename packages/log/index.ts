// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export { color } from "./color";
export type { Console } from "./console/console";
export { FakeConsole } from "./console/fake-console";
export { CompositeLogger } from "./logger/composite-logger";
export {
	ConsoleLogger,
	type ConsoleLoggerOptions,
} from "./logger/console-logger";
export { MdcLogger, type MdcLoggerOptions } from "./logger/context-logger";
export {
	LevelPrefixLogger,
	type LevelPrefixLoggerOptions,
} from "./logger/level-prefix-logger";
export type { LogEntry, Logger, LogLevel } from "./logger/logger";
export { MemoryLogger } from "./logger/memory-logger";
export { PrefixLogger, type PrefixLoggerOptions } from "./logger/prefix-logger";
