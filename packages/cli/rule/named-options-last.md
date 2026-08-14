# Named options last

A function's settings belong in one object, and that object goes last, after
the parameters a caller cannot leave out. The call then reads as the values it
has to pass followed by the choices it is making, and a new setting costs one
more key rather than one more position every existing caller has to count
past.

Write the options type out and give it a name. An inline object type states
the shape where nobody else can reach it: a caller cannot declare a value of
it, an implementation cannot spread it, and a reader learns the settings by
parsing a signature. A named type sitting beside the function is the one place
to say what the options are and what each of them means.

## Good

What the call cannot omit first, the named options object last:

```ts
export interface WriteOptions {
	encoding?: string;
	mode?: number;
}

export function write(path: string, data: string, options: WriteOptions): void {
	files.write(path, data, options.encoding ?? "utf8");
}
```

An injected options object is the same shape, with a default so a caller
taking every default passes nothing:

```ts
export class Fetcher {
	constructor(
		private readonly http: Http,
		private readonly options: RetryOptions = {},
	) {}
}
```

## Bad

Options ahead of the arguments the call cannot omit:

```ts
export function write(
	options: WriteOptions,
	path: string,
	data: string,
): void {}
```

The type written in place, so no caller can name what it is passing:

```ts
export function write(
	path: string,
	options: { encoding?: string; mode?: number },
): void {}
```

Settings spread across positional parameters, where every call site counts
commas and every new setting is a change to all of them:

```ts
export function write(
	path: string,
	data: string,
	encoding: string,
	mode: number,
	append: boolean,
): void {}
```
