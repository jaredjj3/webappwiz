import type { Rule } from "../rule";
import { classesOverFunctionExports } from "./classes-over-function-exports";
import { noEmDashes } from "./no-em-dashes";
import { oneClassPerFile } from "./one-class-per-file";

export { classesOverFunctionExports } from "./classes-over-function-exports";
export { noEmDashes } from "./no-em-dashes";
export { oneClassPerFile } from "./one-class-per-file";

/** The rules every webappwiz repository runs. */
export const recommended: Rule[] = [
	noEmDashes,
	oneClassPerFile,
	classesOverFunctionExports,
];
