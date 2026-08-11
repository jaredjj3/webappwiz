import type { Logger } from "@webappwiz/log";
import type { Fs } from "../fs/fs";
import type { Ps } from "../ps/ps";
import type { HostMapper } from "./host-mapper";

const HOSTS_PATH_UNIX = "/etc/hosts";
const HOSTS_PATH_WINDOWS = "C:\\Windows\\System32\\drivers\\etc\\hosts";

export class FileHostMapper implements HostMapper {
	constructor(
		private readonly fs: Fs,
		private readonly ps: Ps,
		private readonly log: Logger,
		private readonly path: string,
	) {}

	static default(fs: Fs, ps: Ps, log: Logger): FileHostMapper {
		switch (ps.platform) {
			case "darwin":
			case "linux":
				return new FileHostMapper(fs, ps, log, HOSTS_PATH_UNIX);
			case "win32":
				return new FileHostMapper(fs, ps, log, HOSTS_PATH_WINDOWS);
			default:
				throw new Error(`Unsupported platform: ${ps.platform}`);
		}
	}

	async map(hostname: string, ip: string): Promise<void> {
		const hosts = await this.fs.read(this.path);
		const lines = hosts.split("\n");

		const pattern = new RegExp(`^(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+${hostname}$`);
		let found = false;
		let changed = false;

		const updatedLines = lines.map((line) => {
			const match = line.match(pattern);
			if (match) {
				found = true;
				if (match[1] !== ip) {
					changed = true;
					return `${ip}   ${hostname}`;
				}
			}
			return line;
		});

		if (!found) {
			updatedLines.push(`${ip}   ${hostname}`);
			changed = true;
		}

		if (!changed) {
			return;
		}

		const updatedHosts = updatedLines.join("\n");

		if (this.ps.platform === "win32") {
			await this.fs.write(this.path, updatedHosts);
		} else {
			await this.writeHostFileUnix(updatedHosts);
		}
	}

	private async writeHostFileUnix(contents: string): Promise<void> {
		const tempFile = `/tmp/hosts-${Date.now()}`;
		await this.fs.write(tempFile, contents);

		this.log.info(`requesting sudo to update ${this.path}`);
		const copyResult = await this.ps.spawn(["sudo", "cp", tempFile, this.path]);
		if (copyResult.exitCode !== 0) {
			throw new Error(`failed to update ${this.path}`);
		}

		await this.fs.rm(tempFile);
	}
}
