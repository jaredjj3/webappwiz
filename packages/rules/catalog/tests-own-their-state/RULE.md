---
name: tests-own-their-state
description: Tests set up their own state; a harness only names steps and never builds the world.
files: "**/*.test.ts"
level: error
complexity: medium
version: 0.0.11
---
# Tests own their state

A test harness never sets up state. It exists for one reason: to make a test
readable. Naming a step, hiding a noisy construction behind a verb, turning an
assertion into a sentence, all fine. Building the world the test runs against
is not, because a reader who has to open another file to learn what state a
test started in has lost the test.

State belongs to the test. Set a scenario up in the `it` that needs it,
whenever doing so still reads well. When several tests share a scenario, and
only then, it moves up into that `describe`'s `beforeEach`, which does the
setup those tests need and nothing more. A `beforeEach` accumulating state for
tests that do not use it is the same failure as a harness holding it.

A plain `function` at the bottom of the test file is the last resort, and
acceptable when it buys real clarity: it takes what it needs, returns what it
makes, and keeps nothing between calls.

## Good

The scenario a test needs, in the test:

```ts
it("refunds the difference when an item is returned", () => {
	const cart = new Cart([apple, pear]);
	cart.checkout();
	cart.returnItem(pear);
	expect(cart.refunded()).toBe(pear.price);
});
```

Shared state in a `beforeEach`, scoped to the tests that share it:

```ts
describe("checkout", () => {
	let cart: Cart;

	beforeEach(() => {
		cart = new Cart([apple, pear]);
		cart.checkout();
	});

	it("charges the cart total", () => {
		expect(cart.charged()).toBe(apple.price + pear.price);
	});

	it("refunds the difference when an item is returned", () => {
		cart.returnItem(pear);
		expect(cart.refunded()).toBe(pear.price);
	});
});
```

A helper at the bottom of the file, holding nothing:

```ts
it("charges the cart total", () => {
	expect(cartOf(apple, pear).charged()).toBe(apple.price + pear.price);
});

function cartOf(...items: Item[]): Cart {
	const cart = new Cart(items);
	cart.checkout();
	return cart;
}
```

## Bad

A harness that owns the state the tests are about:

```ts
export class CheckoutHarness {
	readonly gateway = new FakeGateway();
	private readonly cart = new Cart();

	withItems(...items: Item[]): this {
		for (const item of items) this.cart.add(item);
		return this;
	}

	checkout(): void {
		this.cart.checkout(this.gateway);
	}
}

it("charges the cart total", () => {
	const harness = new CheckoutHarness().withItems(apple, pear);
	harness.checkout();
	expect(harness.gateway.charges[0]).toBe(apple.price + pear.price);
});
```

A `beforeEach` at the top of the file building a world every test wades
through, most of it for tests elsewhere in the file:

```ts
describe("cart", () => {
	beforeEach(() => {
		gateway = new FakeGateway({ retries: 3 });
		catalog = new Catalog([apple, pear, plum]);
		user = buildUser("us");
		session = Session.begin(gateway, catalog, user);
		cart = session.cart();
		cart.add(apple);
	});

	it("is empty when new", () => {
		expect(new Cart().total()).toBe(0);
	});
});
```

A helper that keeps state between calls:

```ts
let carts: Cart[] = [];

function newCart(): Cart {
	const cart = new Cart();
	carts.push(cart);
	return cart;
}
```
