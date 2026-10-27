export async function text(response: Response): Promise<string> {
	return new TextDecoder().decode(await response.arrayBuffer());
}
