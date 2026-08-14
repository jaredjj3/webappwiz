import type { Hit } from "./hit";
import type { Level } from "./rule";

/** A check's finding, stamped with where it was and which rule said so. */
export interface Diagnostic extends Hit {
	path: string;
	rule: string;
	severity: Level;
}
