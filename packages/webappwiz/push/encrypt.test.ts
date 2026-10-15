import { describe, expect, it } from "bun:test";
import { base64url, bytesOf } from "./base64url";
import { encrypt } from "./encrypt";

describe("encrypt", () => {
	it("matches the RFC 8291 example", async () => {
		const body = await encrypt(
			{
				endpoint:
					"https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV",
				keys: { p256dh: VECTOR.browserPublic, auth: VECTOR.auth },
			},
			new TextEncoder().encode(VECTOR.plaintext),
			{
				keys: await pairOf(VECTOR.serverPublic, VECTOR.serverPrivate),
				salt: bytesOf(VECTOR.salt),
			},
		);

		expect(base64url(body)).toBe(VECTOR.body);
	});

	it("uses a fresh key and salt for each message", async () => {
		const subscription = {
			endpoint: "https://push.example.net/x",
			keys: { p256dh: VECTOR.browserPublic, auth: VECTOR.auth },
		};
		const payload = new TextEncoder().encode("hi");

		const one = await encrypt(subscription, payload);
		const other = await encrypt(subscription, payload);

		expect(base64url(one.slice(0, 16))).not.toBe(base64url(other.slice(0, 16)));
		expect(base64url(one.slice(21, 86))).not.toBe(
			base64url(other.slice(21, 86)),
		);
	});
});

// RFC 8291, Appendix A.
const VECTOR = {
	plaintext: "When I grow up, I want to be a watermelon",
	serverPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
	serverPublic:
		"BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
	browserPublic:
		"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	auth: "BTBZMqHH6r4Tts7J_aSIgg",
	salt: "DGv6ra1nlYgDCS1FRnbzlw",
	body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function pairOf(publicKey: string, privateKey: string) {
	const point = bytesOf(publicKey);
	const jwk = {
		kty: "EC",
		crv: "P-256",
		x: base64url(point.slice(1, 33)),
		y: base64url(point.slice(33, 65)),
	};
	const algorithm = { name: "ECDH", namedCurve: "P-256" };
	return {
		publicKey: await crypto.subtle.importKey("jwk", jwk, algorithm, true, []),
		privateKey: await crypto.subtle.importKey(
			"jwk",
			{ ...jwk, d: privateKey },
			algorithm,
			true,
			["deriveBits"],
		),
	};
}
