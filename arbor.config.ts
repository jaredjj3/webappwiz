export default {
	// Landings can add packages or dependencies; a worktree only installs at
	// postCreate time, so the test gate installs again after the rebase.
	testCommand: "bun install && bun test",
	postCreate: "bun install",
	// Two is thin when a gate failure is a flaky test rather than the change:
	// fixing the test costs an attempt, and confirming the fix costs the last
	// one. Still a guard against thrashing, just not one that trips on the
	// first bad test a task writes.
	mergeRetryCount: 5,
};
