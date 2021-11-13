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

createServer(async (req, res) => {
	const purl = new URL(req.url, "http://" + req.headers.host);
	const query = Object.fromEntries(purl.searchParams);
	// url to get the zip from
	const plainUrl = query.url;
	if (plainUrl == null) return res.writeHead(400).end("No url provided");
	// path within the zip itself
	const pathInZip = query.path.replace("\\", "/");
	if (pathInZip == null) return res.writeHead(400).end("No path provided");

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
	if (response.statusCode !== 200)
		return res
			.writeHead(500)
			.end(`${zipUrl} returned status ${response.statusCode} instead of 200`);
	const directory = await mkdtemp(join(tmpdir(), "unzipper-"));
	console.log("Writing zip to", directory);
	const outputFile = join(directory, name(plainUrl));
	const writeStream = createWriteStream(outputFile);
	response.body.pipe(writeStream);
	writeStream.on("finish", () => {
		console.log(`Finished writing to ${outputFile}, now going to unzip`);
		const unzip = spawn(seven, [
			"x",
			outputFile,
			"-o" + join(directory, "output"),
			pathInZip,
			"-y",
			"-r",
		]);
		unzip.on("close", async code => {
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
			res.writeHead(200, { "Content-Type": filename2mime.lookup(pathInZip) });
			createReadStream(outputFile).pipe(res);
			res.on("close", async () => {
				console.log(`Done! Sent`, pathInZip, "from", plainUrl);
				await rm(directory, { recursive: true });
				console.log("Cleaned up", directory);
			});
		});
	});
}).listen(port, () => console.log(`Listening at http://localhost:${port}/`));
