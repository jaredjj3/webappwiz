export interface Money {
	cents: number;
	currency: string;
}

export function formatPrice(money: Money, locale = "en-US"): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: money.currency,
	}).format(money.cents / 100);
}

export function sumPrices(prices: Money[]): Money {
	const currency = prices[0]?.currency ?? "USD";
	if (prices.some((p) => p.currency !== currency)) {
		throw new Error("cannot sum prices in different currencies");
	}
	return { cents: prices.reduce((sum, p) => sum + p.cents, 0), currency };
}
