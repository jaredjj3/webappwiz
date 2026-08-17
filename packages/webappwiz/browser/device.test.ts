import { describe, expect, it } from "bun:test";

import { Device } from "./index";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD_CHROME =
	"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
	"Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FIRE_TABLET =
	"Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.0.0.0 like Chrome/120.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const FIREFOX =
	"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
const CHROME_ON_IOS =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_IN_TWITTER =
	"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone";

describe("Device", () => {
	it("reads iOS off an iPhone", () => {
		const device = Device.parse(IPHONE, { touchPoints: 5 });

		expect(device.os).toBe("ios");
		expect(device.type).toBe("phone");
		expect(device.isMobile()).toBe(true);
		expect(device.isTouch()).toBe(true);
	});

	it("takes a touch screen as what tells an iPad from a Mac, since both say Macintosh", () => {
		expect(Device.parse(IPAD, { touchPoints: 5 }).os).toBe("ios");
		expect(Device.parse(IPAD, { touchPoints: 5 }).type).toBe("tablet");
		expect(Device.parse(IPAD).os).toBe("macos");
		expect(Device.parse(IPAD).type).toBe("desktop");
	});

	it("keeps an iPad a tablet when the browser on it also says Mobile", () => {
		const device = Device.parse(IPAD_CHROME, { touchPoints: 5 });

		expect(device.type).toBe("tablet");
		expect(device.isTablet()).toBe(true);
		expect(device.isPhone()).toBe(false);
		expect(device.browser).toBe("chrome");
	});

	it("ignores what an in-app browser appended, which names another device", () => {
		expect(Device.parse(IPAD_IN_TWITTER, { touchPoints: 5 }).type).toBe(
			"tablet",
		);
	});

	it("reads Android off a phone", () => {
		const device = Device.parse(ANDROID, { touchPoints: 5 });

		expect(device.os).toBe("android");
		expect(device.isAndroid()).toBe(true);
		expect(device.type).toBe("phone");
	});

	it("takes the missing Mobile as what makes an Android device a tablet", () => {
		expect(Device.parse(ANDROID_TABLET, { touchPoints: 5 }).type).toBe(
			"tablet",
		);
		expect(Device.parse(FIRE_TABLET, { touchPoints: 5 }).type).toBe("tablet");
	});

	it("picks Edge over the Chrome and Safari it also claims to be", () => {
		expect(Device.parse(WINDOWS_EDGE).browser).toBe("edge");
		expect(Device.parse(WINDOWS_EDGE).os).toBe("windows");
		expect(Device.parse(WINDOWS_EDGE).isDesktop()).toBe(true);
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
		expect(device.type).toBe("desktop");
		expect(device.isMobile()).toBe(false);
	});

	it("is unknown for a string that says nothing", () => {
		const device = Device.parse("curl/8.4.0");

		expect(device.os).toBe("unknown");
		expect(device.browser).toBe("unknown");
		expect(device.type).toBe("desktop");
		expect(device.isTouch()).toBe(false);
	});
});
