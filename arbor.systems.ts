import type { SystemsFile } from "@webappwiz/arbor/systems";

export default {
	conversations: {
		description: "The agent conversations on the arbor dev page",
		aliases: ["conversation view"],
		globs: [
			"packages/arbor/conversations*.ts",
			"packages/arbor/dev/conversation*.ts*",
			"packages/arbor/dev/work*.ts*",
			"packages/arbor/dev/app-conversation*.test.tsx",
		],
	},
	composer: {
		description: "Writing a message, with its # and @ references",
		aliases: ["mentions"],
		globs: [
			"packages/arbor/dev/composing.tsx",
			"packages/arbor/dev/mentions.tsx",
			"packages/arbor/dev/references.tsx",
			"packages/arbor/dev/directives.tsx",
			"packages/arbor/dev/app-mentions.test.tsx",
		],
	},
	checkpoint: {
		description: "Restarting arbor dev without losing agents' work",
		aliases: ["restart"],
		globs: [
			"packages/arbor/dev/checkpoint.tsx",
			"packages/arbor/dev/auto-restart*.ts*",
		],
	},
	board: {
		description: "Todos and the lanes they sit in",
		aliases: ["todos", "lanes"],
		globs: [
			"packages/arbor/todo*.ts",
			"packages/arbor/lane*.ts",
			"packages/arbor/dev/todo*.ts*",
			"packages/arbor/dev/lanes.tsx",
			"packages/arbor/dev/board.ts",
			"packages/arbor/dev/app-todo*.test.tsx",
			"packages/arbor/dev/app-lanes.test.tsx",
		],
	},
	mobile: {
		description: "arbor dev's phone layout",
		aliases: ["phone"],
		globs: [
			"packages/arbor/dev/phone-*.tsx",
			"packages/arbor/dev/app-phone.test.tsx",
		],
	},
	annotation: {
		description: "Marking up a screenshot for an agent",
		globs: [
			"packages/arbor/dev/annotation.ts",
			"packages/arbor/dev/annotation.test.ts",
			"packages/arbor/dev/annotate.tsx",
		],
	},
	scry: {
		description: "Checking code against rules written in prose",
		globs: ["packages/scry/**"],
	},
	dictate: {
		description: "Speaking a message instead of typing it",
		aliases: ["dictation"],
		globs: [
			"packages/webappwiz/dictate/**",
			"packages/arbor/dev-dictation*.ts",
			"packages/arbor/dev-transcriber.ts",
			"packages/arbor/vocabulary*.ts",
			"packages/arbor/dev/dictat*.ts*",
			"packages/arbor/dev/take-under-way.ts",
			"packages/arbor/dev/app-conversation-dictation.test.tsx",
		],
	},
	skills: {
		description: "The skills agents read",
		globs: ["skills/**"],
	},
} satisfies SystemsFile;
