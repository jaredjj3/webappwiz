export type Os = "ios" | "android" | "macos" | "windows" | "linux" | "unknown";

export type BrowserName = "safari" | "chrome" | "firefox" | "edge" | "unknown";

export interface DeviceOptions {
	/** `navigator.maxTouchPoints`. Left out, the device is taken to be untouched. */
	touchPoints?: number;
}

/**
 * What a user agent string says about the device it came from: the operating
 * system, the browser, and whether there is a touch screen.
 *
 * It takes the string rather than reading `navigator`, so the same call works
 * on the server against a request header and a test can hand it whatever it
 * likes.
 *
 * ```ts
 * const device = Device.parse(navigator.userAgent, {
 *   touchPoints: navigator.maxTouchPoints,
 * });
 * if (device.isIos) { ... }
 * ```
 *
 * It answers those three questions and no others. Browser versions, device
 * models and bot detection need a maintained database of user agents, which
 * this is not.
 */
export class Device {
	private constructor(
		readonly os: Os,
		readonly browser: BrowserName,
		readonly touch: boolean,
	) {}

	static parse(userAgent: string, opts: DeviceOptions = {}): Device {
		const touchPoints = opts.touchPoints ?? 0;
		return new Device(
			parseOs(userAgent, touchPoints),
			parseBrowser(userAgent),
			touchPoints > 0,
		);
	}

	get isIos(): boolean {
		return this.os === "ios";
	}

	get isAndroid(): boolean {
		return this.os === "android";
	}

	get isMobile(): boolean {
		return this.isIos || this.isAndroid;
	}
}

function parseOs(userAgent: string, touchPoints: number): Os {
	if (/iPhone|iPad|iPod/.test(userAgent)) {
		return "ios";
	}
	// iPadOS 13 and later claim to be a Mac. The touch screen is what gives them
	// away, and a desktop Mac reports no touch points at all.
	if (/Macintosh/.test(userAgent)) {
		return touchPoints > 1 ? "ios" : "macos";
	}
	if (/Android/.test(userAgent)) {
		return "android";
	}
	if (/Windows/.test(userAgent)) {
		return "windows";
	}
	if (/Linux|X11/.test(userAgent)) {
		return "linux";
	}
	return "unknown";
}

// Order matters and is the reverse of how specific each name looks. Edge says
// both Chrome and Safari, Chrome says Safari, and only Safari says Safari
// alone, so the broadest claim is checked last.
function parseBrowser(userAgent: string): BrowserName {
	// Edg/ on desktop, EdgA/ on Android, EdgiOS/ on iOS, Edge/ on the old one.
	if (/Edg(e|A|iOS)?\//.test(userAgent)) {
		return "edge";
	}
	if (/Chrome|Chromium|CriOS/.test(userAgent)) {
		return "chrome";
	}
	if (/Firefox|FxiOS/.test(userAgent)) {
		return "firefox";
	}
	if (/Safari/.test(userAgent)) {
		return "safari";
	}
	return "unknown";
}
