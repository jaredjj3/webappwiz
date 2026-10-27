export function credentials(header: string): [string, string] {
	const [user = "", password = ""] = atob(header.replace(/^Basic /, "")).split(":");
	return [user, password];
}
