export function claims(token: string): Record<string, unknown> {
	const [, body = ""] = token.split(".");
	return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}
