// must be run with `node --env-file .env index.js`
if (!process.env.ACCESS_KEY) {
	console.error('Could not find process.env.ACCESS_KEY in .env');
	console.error('Please run the server with `node --env-file .env index.js`');
	process.exit(1);
}

const fs = require('node:fs');

const express = require('express');
const Database = require('./Database');
const { FILES_FOLDER } = require('./Constants');
const { createHash } = require('node:crypto');
const FileCache = require('./FileCache');

const CacheSettings = {
	maxFileCount: 1000,
	maxMemory: 1024 * 1024 * 1024, // 1024MB
};

const cacheStart = Date.now();

const fileCache = new FileCache(CacheSettings);
// fetch the last 100 files and cache them
const recentFiles = Database.prepare('SELECT * FROM Files ORDER BY access_at DESC LIMIT ?').all(CacheSettings.maxFileCount * 0.5);
for (const file of recentFiles) {
	if (!fs.existsSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`)) {
		// remove from database
		console.log(`File ${file.hash}.${file.ext} not found, removing from database`);
		Database.prepare('DELETE FROM Files WHERE id = ?').run(file.id);
		continue;
	}
	const data = fs.readFileSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`);
	fileCache.add(file.lookup, data);
}

const fileCacheEnd = Date.now();
console.log(`File cache loaded ${fileCache.files.size} files in ${fileCacheEnd - cacheStart}ms`);


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
function SecureStringTest(a = '', b = '') {
	if (a.length !== b.length) return false;

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}


function GetTimestamp() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const hours = now.getHours();
	const minutes = now.getMinutes();
	const seconds = now.getSeconds();
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function ResolveIP(input) {
	const [ IPv6, IPv4 ] = input.split(',');
	return IPv6 ?? IPv4 ?? null;
}

app.all('*', (req, res, next) => {
	const IP = ResolveIP(req.headers['x-forwarded-for']);
	const timestamp = GetTimestamp();
	console.log(`[${timestamp}] ${IP} : ${req.method} ${req.url}`);
	next();
});

const MAX_UPLOAD_SIZE = 1024 * 1024 * 100; // 100MB

app.post('/upload', async function (req, res) {
	const key = req.headers['key'];
	if ( !SecureStringTest(key, process.env.ACCESS_KEY) ) return res.status(401).send('Unauthorized');

	const name = req.headers['name'];
	const ext = req.headers['ext'] || req.headers['extension'];
	const downloadCount = parseInt(req.headers['download-limit']) || null;
	const data = (req.body && Buffer.isBuffer(req.body)) ? req.body : Buffer.from(req.body);

	if (!data || !name || !ext) return res.status(400).send('Invalid request');
	if (data.length > MAX_UPLOAD_SIZE) return res.status(413).send('File too large');

	const safeName = String(name).replace(/[^a-zA-Z0-9_\-]/g, '');
	const safeExt = String(ext).replace(/[^a-zA-Z0-9]/g, '');

	const hash = createHash('sha256').update(data).digest('hex');
	
	const exists = Database.prepare('SELECT lookup FROM Files WHERE hash = ?').pluck().get(hash);
	if (exists) return res.status(201).send(exists);

	// add the file to the database
	await fs.promises.writeFile(`${FILES_FOLDER}/${hash}.${safeExt}`, data);
	const result = Database.prepare('INSERT INTO Files (name, ext, hash, size, download_limit) VALUES (?, ?, ?, ?, ?)').run(safeName, safeExt, hash, data.length, downloadCount);

	const lookup = hash + String(result.lastInsertRowid);

	res.status(200).send(lookup);
});

function ResolveFileLookup(lookup, update = true, decrement = true) {
	const file = Database.prepare('SELECT * FROM Files WHERE lookup = ?').get(lookup);
	if (!file) return null;
	if (update) Database.prepare(`UPDATE Files SET access_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE lookup = ?`).run(lookup);
	if (decrement && file.download_limit !== null) {
		if (file.download_limit <= 0) {
			return null;
		} else {
			Database.prepare('UPDATE Files SET download_limit = download_limit - 1 WHERE lookup = ?').run(lookup);
		}
	}
	return file;
}

// cdn.notfbi.dev/fetch/<lookup>
app.get('/fetch/:lookup', async function (req, res) {
	const lookup = req.params.lookup;
	
	if (fileCache.has(lookup)) {
		const ETag = '"' + lookup + '"';
		if (req.headers['if-none-match'] === ETag) {
			return res.status(304).send();
		}
		
		res.setHeader('ETag', ETag);
		res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
		
		const data = fileCache.get(lookup);
		res.status(200).send(data);
		return;
	}
	const file = ResolveFileLookup(lookup);
	if (!file) return res.status(404).send('Not found');

	const ETag = '"' + file.lookup + '"';
	if (req.headers['if-none-match'] === ETag) {
		return res.status(304).send();
	}
	
	res.setHeader('ETag', ETag);
	res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

	const data = fs.readFileSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`);
	fileCache.add(lookup, data);

	res.status(200).send(data);
});

// cdn.notfbi.dev/download/<lookup>
app.get('/download/:lookup', async function (req, res) {
	const lookup = req.params.lookup;
	
	const file = ResolveFileLookup(lookup);
	if (!file) return res.status(404).send('Not found');

	if (!fs.existsSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`)) {
		return res.status(404).send('Not found');
	}

	return res.status(200).download(`${FILES_FOLDER}/${file.hash}.${file.ext}`, `${file.name}.${file.ext}`);
});

// cdn.notfbi.dev/delete/<lookup>
app.delete('/delete/:lookup', async function (req, res) {
	const lookup = req.params.lookup;

	const key = req.headers['key'];
	if ( !SecureStringTest(key, process.env.ACCESS_KEY) ) return res.status(401).send('Unauthorized');

	const file = ResolveFileLookup(lookup, false);
	if (!file) return res.status(404).send('Not found');

	if (fs.existsSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`)) {
		fs.unlinkSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`);
		Database.prepare('DELETE FROM Files WHERE lookup = ?').run(lookup);

		res.status(200).send('Deleted');
	} else {
		res.status(404).send('Not found');
	}
});

// cdn.notfbi.dev
const server = app.listen(3001, () => {
	console.log('Server started');
});

process.on('SIGINT', () => {
	console.log('Shutting down...');
	server.close();

	console.log('Optimising database...');
	Database.pragma('analysis_limit = 8000');
	Database.exec('ANALYZE'); // Optimise the database and add indecies
	Database.exec('VACUUM'); // Clear dead space to reduce file size
	Database.close();

	process.exit(0);
});

setInterval(PurgeDatabase, 1000 * 60 * 60 * 24); // 24 hours
PurgeDatabase();
async function PurgeDatabase() {
	const files = Database.prepare(`
		SELECT *
		FROM Files
		WHERE
			(access_at < datetime('now', '-60 days')) OR
			(created_at < datetime('now', '-24 hours') AND download_limit IS NOT NULL) OR
			download_limit = 0
	`).all();
	if (files.length === 0) {
		console.log('Nothing to delete');
		return;
	}

	console.log(`Deleting ${files.length} files...`);
	const start = Date.now();
	
	for (const file of files) {
		if (fs.existsSync(`${FILES_FOLDER}/${file.hash}.${file.ext}`)) {
			// The loop will continue without waiting for the deletion to finish
			// We don't care about the result, just that it happens, so we don't need to await it
			// This can be a bit dangerous but I don't care enough
			await fs.promises.unlink(`${FILES_FOLDER}/${file.hash}.${file.ext}`);
		}
	}
	Database.prepare(`
		DELETE FROM Files
		WHERE 
			(access_at < datetime('now', '-60 days')) OR
			(created_at < datetime('now', '-24 hours') AND download_limit IS NOT NULL) OR
			download_limit = 0
	`).run();

	const end = Date.now();
	console.log(`Deleted ${files.length} files in ${end - start}ms`);
}
