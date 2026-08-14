import type { Rule as Core } from "@webappwiz/rules";
import type { Changeset } from "../changeset";

/**
 * One rule of a signoff. The unit is the whole change: `check` reads the
 * changeset and returns everything a person has to look at, escalating when
 * deciding the rule means reading the change rather than matching it.
 */
export type Rule = Core<Changeset>;
