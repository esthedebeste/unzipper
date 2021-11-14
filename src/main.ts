import * as filename2mime from "filename2mime";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "undici";
import { find7z } from "./7z.js";

const port = process.env.PORT || 8080;

const sevens = await find7z();
const seven = sevens[0];
if (seven == null) throw new Error("7z not found");
console.log("Found 7z at", seven);
const name = (file: string) => file.slice(file.lastIndexOf("/") + 1);

const clean = async (dir: string) => {
	await rm(dir, { recursive: true });
	console.log("Cleaned up", dir);
};

/** A promise wrapper around EventEmitter.once */
const waitFor = <E, T>(
	eventEmitter: {
		once: (event: E, callback: (value: T) => void) => void;
	},
	event: E
): Promise<T> => new Promise(callback => eventEmitter.once(event, callback));

const redirectStatusCodes = [301, 302, 303, 307, 308];

createServer(async (req, res) => {
	const purl = new URL(req.url, "http://" + req.headers.host);
	const query = Object.fromEntries(purl.searchParams);
	if (query.url == null) return res.writeHead(400).end("No url provided");
	if (query.path == null) return res.writeHead(400).end("No path provided");
	// url to get the zip from
	const plainUrl = query.url;
	// path within the zip itself
	const pathInZip = query.path
		.replace("\\", "/")
		// Remove leading slash
		.replace(/^\//, "")
		.split("/")
		// Remove ..
		.filter(part => part != "..")
		.join("/");
	let zipUrl: URL;
	try {
		zipUrl = new URL(plainUrl);
	} catch (err) {
		return res.writeHead(400).end("Invalid url");
	}

	// get the zip
	console.log("Making request to", zipUrl.href);
	const response = await request(zipUrl, {
		method: "GET",
		maxRedirections: 16,
	});
	if (redirectStatusCodes.includes(response.statusCode))
		return res.writeHead(400).end("Too many redirects");
	if (response.statusCode !== 200)
		return res
			.writeHead(500)
			.end(`${zipUrl} returned status ${response.statusCode} instead of 200`);
	const directory = await mkdtemp(join(tmpdir(), "unzipper-"));
	console.log("Writing zip to", directory);
	const zipLocation = join(directory, name(plainUrl));
	const writeStream = createWriteStream(zipLocation);
	response.body.pipe(writeStream);
	await waitFor(writeStream, "finish");
	console.log(`Finished writing to ${zipLocation}, now going to unzip`);
	const unzip = spawn(seven, [
		"x",
		zipLocation,
		"-o" + join(directory, "output"),
		pathInZip,
		"-y",
		"-r",
	]);
	const cancel = setTimeout(async () => {
		console.log(`Unzipping ${name(plainUrl)} is taking too long, sending 400`);
		unzip.kill();
		res.writeHead(400).end("Unzipping took too long");
		await clean(directory);
	}, 10000);
	const code: number = await waitFor(unzip, "close");
	// unzip cancelled
	if (res.writableEnded) return;
	clearTimeout(cancel);
	if (code !== 0) return res.writeHead(500).end("Failed to unzip");
	console.log("Finished unzipping");
	const outputFile = join(directory, "output", pathInZip);
	try {
		await stat(outputFile);
	} catch (err) {
		return res
			.writeHead(404)
			.end(`${pathInZip} doesn't exist in ${name(plainUrl)}`);
	}
	res.writeHead(200, {
		"Content-Type": filename2mime.lookup(pathInZip),
		// Tell the client the filename, but don't force a "Save As" dialog (for displaying HTML from a zip, for example)
		"Content-Disposition": `filename="${name(pathInZip)}"`,
	});
	createReadStream(outputFile).pipe(res);
	await waitFor(res, "finish");
	console.log(`Done! Sent`, pathInZip, "from", plainUrl);
	await clean(directory);
}).listen(port, () => console.log(`Listening at http://localhost:${port}/`));
