import { describe, expect, it } from "bun:test";

import { Device } from "./index";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const WINDOWS_EDGE =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const FIREFOX =
	"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
const CHROME_ON_IOS =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";

describe("Device", () => {
	it("reads iOS off an iPhone", () => {
		const device = Device.parse(IPHONE, { touchPoints: 5 });

		expect(device.os).toBe("ios");
		expect(device.isMobile).toBe(true);
		expect(device.touch).toBe(true);
	});

	it("takes a touch screen as what tells an iPad from a Mac, since both say Macintosh", () => {
		expect(Device.parse(IPAD, { touchPoints: 5 }).os).toBe("ios");
		expect(Device.parse(IPAD).os).toBe("macos");
	});

	it("reads Android off a phone", () => {
		const device = Device.parse(ANDROID, { touchPoints: 5 });

		expect(device.os).toBe("android");
		expect(device.isAndroid).toBe(true);
	});

	it("picks Edge over the Chrome and Safari it also claims to be", () => {
		expect(Device.parse(WINDOWS_EDGE).browser).toBe("edge");
		expect(Device.parse(WINDOWS_EDGE).os).toBe("windows");
	});

	it("picks Chrome over the Safari it also claims to be", () => {
		expect(Device.parse(MAC).browser).toBe("chrome");
	});

	it("names Safari only when nothing else claimed the string", () => {
		expect(Device.parse(IPHONE).browser).toBe("safari");
	});

	it("recognises Chrome on iOS, which calls itself CriOS", () => {
		const device = Device.parse(CHROME_ON_IOS, { touchPoints: 5 });

		expect(device.browser).toBe("chrome");
		expect(device.os).toBe("ios");
	});

	it("reads Firefox on Linux", () => {
		const device = Device.parse(FIREFOX);

		expect(device.browser).toBe("firefox");
		expect(device.os).toBe("linux");
		expect(device.isMobile).toBe(false);
	});

	it("is unknown for a string that says nothing", () => {
		const device = Device.parse("curl/8.4.0");

		expect(device.os).toBe("unknown");
		expect(device.browser).toBe("unknown");
		expect(device.touch).toBe(false);
	});
});
