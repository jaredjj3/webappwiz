// Everything `wiz` does for arbor sits here, so that when arbor leaves this
// repository as Spinning Plates (todo #307), deleting this file and what
// imports it is the whole of the change.

/** Arbor's skill and evals, which `wiz ship` and `wiz eval` cover. */
export const ARBOR = {
	/** The skill `wiz ship` stamps with each release, beside webappwiz's own. */
	skills: ["skills/arbor/SKILL.md"],
	/** What `wiz eval` runs, from the workspace root. */
	evals: "evals/arbor-skill/index.ts",
};
