# Reactive over useState

An interaction with several moving parts is a piece of logic, and logic belongs
in a plain class you can read, test and call without a renderer. Give the class
a `Dispatcher` from `webappwiz/events`, dispatch when its state changes, and
let the component read a projection of it through `useReactive`. `useState`
stays for what it is good at: one local, self contained value nothing else
cares about. Once two pieces of state have to agree, or an effect exists to
keep them in step, the component is modeling the logic and the class should be.

## Good

```tsx
type SearchEvents = { changed: undefined };

class Search implements Eventful<SearchEvents> {
	private readonly dispatcher = new Dispatcher<SearchEvents>();
	readonly events = this.dispatcher.events;

	query = "";
	results: Result[] = [];
	searching = false;

	constructor(private readonly results_: Results) {}

	async search(query: string): Promise<void> {
		this.query = query;
		this.searching = true;
		this.dispatcher.dispatch("changed");
		this.results = await this.results_.matching(query);
		this.searching = false;
		this.dispatcher.dispatch("changed");
	}
}

function SearchBox({ search }: { search: Search }) {
	const { query, results, searching } = useReactive(
		search,
		(search) => ({
			query: search.query,
			results: search.results,
			searching: search.searching,
		}),
		["changed"],
	);

	return (
		<>
			<input value={query} onChange={(e) => search.search(e.target.value)} />
			{searching ? <Spinner /> : <Results results={results} />}
		</>
	);
}
```

A single value the component owns alone is still `useState`:

```tsx
function Disclosure({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button onClick={() => setOpen(!open)}>details</button>
			{open && children}
		</>
	);
}
```

## Bad

State that has to agree with itself, kept in step by hand:

```tsx
function SearchBox({ results }: { results: Results }) {
	const [query, setQuery] = useState("");
	const [found, setFound] = useState<Result[]>([]);
	const [searching, setSearching] = useState(false);

	useEffect(() => {
		setSearching(true);
		results.matching(query).then((matches) => {
			setFound(matches);
			setSearching(false);
		});
	}, [query, results]);

	return (
		<>
			<input value={query} onChange={(e) => setQuery(e.target.value)} />
			{searching ? <Spinner /> : <Results results={found} />}
		</>
	);
}
```
