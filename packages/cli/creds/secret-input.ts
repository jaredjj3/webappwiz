/** Where a person types a credential's value, or a program pipes it. */
export interface SecretInput {
	/** What a person types at a prompt that shows nothing; undefined with no terminal. */
	hidden(question: string): Promise<string | undefined>;
	/** Everything piped in on stdin. */
	piped(): Promise<string>;
}

/** The process's own terminal and stdin. */
export class ProcessSecretInput implements SecretInput {
	hidden(question: string): Promise<string | undefined> {
		const stdin = process.stdin;
		if (!stdin.isTTY) {
			return Promise.resolve(undefined);
		}
		process.stderr.write(question);
		stdin.setRawMode(true);
		stdin.setEncoding("utf8");
		stdin.resume();
		return new Promise((resolve, reject) => {
			let value = "";
			const done = () => {
				stdin.off("data", read);
				stdin.setRawMode(false);
				stdin.pause();
				process.stderr.write("\n");
			};
			const read = (chunk: string) => {
				for (const char of chunk) {
					if (char === "\r" || char === "\n") {
						done();
						resolve(value);
						return;
					}
					if (char === "\u0003") {
						done();
						reject(new Error("cancelled"));
						return;
					}
					value = char === "\u007f" ? value.slice(0, -1) : value + char;
				}
			};
			stdin.on("data", read);
		});
	}

	piped(): Promise<string> {
		return Bun.stdin.text();
	}
}
