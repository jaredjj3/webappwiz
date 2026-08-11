import type { Rule } from "../rule";
import { ClassesOverFunctionExports } from "./classes-over-function-exports";
import { NoEmDashes } from "./no-em-dashes";
import { OneClassPerFile } from "./one-class-per-file";

export { ClassesOverFunctionExports } from "./classes-over-function-exports";
export { NoEmDashes } from "./no-em-dashes";
export { OneClassPerFile } from "./one-class-per-file";

/** The rules every webappwiz repository runs. */
export const recommended: Rule[] = [
	new NoEmDashes(),
	new OneClassPerFile(),
	new ClassesOverFunctionExports(),
];
