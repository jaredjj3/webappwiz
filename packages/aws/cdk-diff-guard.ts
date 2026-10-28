#!/usr/bin/env bun

const STATEFUL_RESOURCE_TYPES = new Set([
	"AWS::RDS::DBCluster",
	"AWS::RDS::DBInstance",
	"AWS::Route53::HostedZone",
	"AWS::S3::Bucket",
	"AWS::SecretsManager::Secret",
]);
// biome-ignore lint/suspicious/noControlCharactersInRegex: strip terminal colors from CDK output
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const SUMMARY_PATTERN =
	/Found \d+ destructive change\(s\) \(--fail-on=destructive\):/;
const CHANGE_PATTERN =
	/^\s*[^:]+:\s+(AWS::[^\s]+)\s+.+\s+(?:will be (?:replaced|destroyed|orphaned)|may be replaced)\s*$/;

export function statefulDestructiveChanges(
	output: string,
): string[] | undefined {
	const lines = output.replace(ANSI_PATTERN, "").split("\n");
	const summaryIndex = lines.findIndex((line) => SUMMARY_PATTERN.test(line));
	if (summaryIndex === -1) {
		return undefined;
	}

	const stateful: string[] = [];
	for (const line of lines.slice(summaryIndex + 1)) {
		if (!line.trim()) {
			continue;
		}
		const match = line.match(CHANGE_PATTERN);
		if (!match) {
			return undefined;
		}
		const resourceType = match[1];
		if (resourceType && STATEFUL_RESOURCE_TYPES.has(resourceType)) {
			stateful.push(line.trim());
		}
	}
	return stateful;
}

export async function runCdkDiffGuard(args: string[]): Promise<number> {
	let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		child = Bun.spawn(
			["cdk", "diff", "--fail-on=destructive", "--method=change-set", ...args],
			{ stdout: "pipe", stderr: "pipe" },
		);
	} catch (error) {
		console.error(
			`webappwiz-cdk-guard: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	process.stdout.write(stdout);
	process.stderr.write(stderr);

	const stateful = statefulDestructiveChanges(`${stdout}\n${stderr}`);
	if (stateful === undefined) {
		return exitCode;
	}
	if (stateful.length > 0) {
		console.error(
			`Stateful resources must not be replaced, deleted, or orphaned:\n${stateful.join("\n")}`,
		);
		return 1;
	}
	return exitCode === 1 ? 0 : exitCode;
}

if (import.meta.main) {
	process.exitCode = await runCdkDiffGuard(Bun.argv.slice(2));
}
