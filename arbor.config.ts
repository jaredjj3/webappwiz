import { defineConfig } from "@webappwiz/arbor/config";

export default defineConfig({
	postCheckout: "bun install",
	postRewrite: "bun install",
	preMerge: "./bin/wiz dev test",
	systems: {
		conversations: {
			aliases: ["conversation view"],
			globs: [
				"packages/arbor/conversations*.ts",
				"packages/arbor/dev/conversation*.ts*",
				"packages/arbor/dev/work*.ts*",
				"packages/arbor/dev/app-conversation*.test.tsx",
			],
		},
		composer: {
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
			aliases: ["restart"],
			globs: [
				"packages/arbor/dev/checkpoint.tsx",
				"packages/arbor/dev/auto-restart*.ts*",
			],
		},
		board: {
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
		annotation: {
			globs: [
				"packages/arbor/dev/annotation.ts",
				"packages/arbor/dev/annotation.test.ts",
				"packages/arbor/dev/annotate.tsx",
			],
		},
		scry: {
			globs: ["packages/scry/**"],
		},
		skills: {
			globs: ["skills/**"],
		},
	},
});
