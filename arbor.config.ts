export default {
	// Landings can add packages or dependencies; a worktree only installs at
	// postCreate time, so the test gate installs again after the rebase.
	testCommand: "bun install && bun test",
	postCreate: "bun install",
};
