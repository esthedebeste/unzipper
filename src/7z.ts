import { stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = key => process.env[key] || "";

const extraPaths = [
	fileURLToPath(new URL("..", import.meta.url)),
	process.cwd(),
	join(process.cwd(), "7zip"),
];

const fulfilled = <T>(
	result: PromiseFulfilledResult<T> | PromiseRejectedResult
): result is PromiseFulfilledResult<T> => result.status === "fulfilled";

export async function find7z(): Promise<string[]> {
	const path = env("PATH").split(delimiter).concat(extraPaths);
	const exts = env("PATHEXT").split(delimiter);

	const possibilities: string[] = [];
	for (const dir of path) {
		for (const ext of exts) {
			possibilities.push(join(dir, "7z" + ext));
		}
	}
	const results = await Promise.allSettled(
		possibilities.map(location =>
			stat(location).then(stat => ({ location, stat }))
		)
	);
	const found = results.filter(fulfilled).map(result => result.value.location);
	return found;
}
