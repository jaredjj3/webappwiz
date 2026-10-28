import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { statefulDestructiveChanges } from "./cdk-diff-guard";

const tempDirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("statefulDestructiveChanges", () => {
	it("returns stateful changes and ignores stateless ones", () => {
		const output = `
Stack App
Resources
\u001b[31m❌  Found 6 destructive change(s) (--fail-on=destructive):\u001b[39m
  App: AWS::RDS::DBCluster DatabaseCluster will be replaced
  App: AWS::RDS::DBInstance DatabaseInstance will be destroyed
  App: AWS::Route53::HostedZone DomainZone will be orphaned
  App: AWS::S3::Bucket AssetsBucket will be replaced
  App: AWS::SecretsManager::Secret DatabaseSecret may be replaced
  App: AWS::Lambda::Function ApiFunction will be replaced
`;

		expect(statefulDestructiveChanges(output)).toEqual([
			"App: AWS::RDS::DBCluster DatabaseCluster will be replaced",
			"App: AWS::RDS::DBInstance DatabaseInstance will be destroyed",
			"App: AWS::Route53::HostedZone DomainZone will be orphaned",
			"App: AWS::S3::Bucket AssetsBucket will be replaced",
			"App: AWS::SecretsManager::Secret DatabaseSecret may be replaced",
		]);
	});

	it("returns no stateful changes when only stateless resources change", () => {
		const output = `❌  Found 1 destructive change(s) (--fail-on=destructive):
  App: AWS::Lambda::Function ApiFunction will be replaced
`;

		expect(statefulDestructiveChanges(output)).toEqual([]);
	});

	it("does not recognize a CDK error as a destructive-change summary", () => {
		expect(statefulDestructiveChanges("cdk diff failed")).toBeUndefined();
	});

	it("fails closed when the summary format is not recognized", () => {
		const output = `❌  Found 1 destructive change(s) (--fail-on=destructive):
  an unfamiliar summary line
`;

		expect(statefulDestructiveChanges(output)).toBeUndefined();
	});
});

describe("webappwiz-cdk-guard", () => {
	it("runs an accurate CDK diff and exits unsuccessfully for stateful changes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cdk-diff-guard-"));
		tempDirs.push(dir);
		const argsFile = join(dir, "args");
		const fakeCdk = join(dir, "cdk");
		await Bun.write(
			fakeCdk,
			`#!/bin/sh
printf '%s\\n' "$@" > "$CDK_ARGS_FILE"
cat <<'OUTPUT'
Stack Staging/App
❌  Found 1 destructive change(s) (--fail-on=destructive):
  Staging/App: AWS::RDS::DBInstance Database/Instance will be replaced
OUTPUT
exit 1
`,
		);
		await chmod(fakeCdk, 0o755);

		const child = Bun.spawn(
			[
				"bun",
				resolve(import.meta.dirname, "cdk-diff-guard.ts"),
				"Staging/App",
				"--context",
				"stage=staging",
			],
			{
				env: {
					...process.env,
					CDK_ARGS_FILE: argsFile,
					PATH: `${dir}:${process.env.PATH}`,
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);

		expect(exitCode).toBe(1);
		expect(stdout).toContain("AWS::RDS::DBInstance Database/Instance");
		expect(stderr).toContain(
			"Stateful resources must not be replaced, deleted, or orphaned",
		);
		expect(await Bun.file(argsFile).text()).toBe(
			"diff\n--fail-on=destructive\n--method=change-set\nStaging/App\n--context\nstage=staging\n",
		);
	});
});
