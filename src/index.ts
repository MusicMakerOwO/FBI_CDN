import { Database } from "./Database";
import { FILES_FOLDER } from "./Constants";
import express from "express";
import { Log } from "./Log";
import { AddFile, GetFile } from "./LocalFileManagement";
import mime from "mime-types";

import * as dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../.env` });

if (!process.env.ACCESS_KEY) {
	console.error('Could not find ACCESS_KEY in .env');
	process.exit(1);
}

const app = express();
app.use(express.raw({ limit: '100mb' }));
//define the CORS headers
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, key');
	res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

// It's not very efficient but can prevent against timing attacks
function SecureStringTest(a: string, b: string) {
	if (a.length !== b.length) return false;

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

function ResolveIP(input: string) {
	const [ IPv6, IPv4 ] = input.split(',');
	return IPv6 ?? IPv4 ?? null;
}

app.all('*', (req, res, next) => {
	const IP = ResolveIP(req.headers['x-forwarded-for'] as string);
	Log('INFO', `${IP} : ${req.method} ${req.url}`);
	next();
});

app.get('/favicon.ico', (req, res) => {
	// no icon
	return res.status(200).send('OK');
});

const MAX_UPLOAD_SIZE = 1024 * 1024 * 100; // 100MB

app.post('/upload', async function (req, res) {
	const key = req.headers['key'] ?? '';
	if ( typeof key !== 'string' || !SecureStringTest(key, process.env.ACCESS_KEY!) ) return res.status(401).send('Unauthorized');

	const fileName = req.headers['file-name'];
	if (
		typeof fileName !== 'string'
	) return res.status(400).send('Invalid request');

	const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
	if (data.length > MAX_UPLOAD_SIZE) return res.status(413).send('File too large');

	const lookup = await AddFile(fileName, data);
	res.status(200).send(lookup);
});

// cdn.notfbi.dev/fetch/<lookup>
app.get('/fetch/:lookup', async function (req, res) {
	const lookup = req.params.lookup.replace(/\..*/, '');
	const data = await GetFile(lookup);
	if (!data) {
		res.status(404).send('Not found');
	} else {
		const mimeType = mime.lookup(data.fileName) || "application/octet-stream";
		res.setHeader("Content-Type", mimeType);
		res.status(200).send(data.data);
	}
});

// cdn.notfbi.dev/download/<lookup>
app.get('/download/:lookup', async function (req, res) {
	const lookup = req.params.lookup.replace(/\..*/, '');
	const data = await GetFile(lookup);
	if (!data) {
		res.status(404).send('Not found');
	} else {
		res.status(200).download(`${FILES_FOLDER}/${data.hash}`, data.fileName);
	}
});

// cdn.notfbi.dev
const server = app.listen(3001, () => {
	Log('INFO', 'Server started');
});

process.on('SIGINT', () => {
	console.log();

	Log('WARN', 'Shutting down...');
	server.close();

	Log('WARN', 'Optimising database...');
	Database.destroy().catch(console.error);

	process.exit(0);
});

process.on('uncaughtException', (err) => Log('ERROR', err));
process.on('unhandledRejection', (reason) => Log('ERROR', reason));