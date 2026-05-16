import "dotenv/config";

import BetterSqlite3 from "better-sqlite3";
import { Database as MariaDatabase } from "./Database";
import { DeriveContentType } from "./ContentType";
import { DB_FILE } from "./Constants";

type SqliteFileRow = {
	id: number;
	fileName: string;
	hash: string;
	lookup: string;
};

type CliOptions = {
	batchSize: number;
	startId: number;
	maxRows: number | null;
	dryRun: boolean;
	updateExisting: boolean;
};

function sanitizeFileName(fileName: string): string {
	return fileName.replace(/[^a-zA-Z0-9_.\-]/g, "");
}

function parseOptions(argv: string[]): CliOptions {
	const options: CliOptions = {
		batchSize: 1000,
		startId: 0,
		maxRows: null,
		dryRun: false,
		updateExisting: true,
	};

	for (const arg of argv) {
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (arg === "--no-update") {
			options.updateExisting = false;
			continue;
		}

		if (arg.startsWith("--batch-size=")) {
			const value = Number(arg.slice("--batch-size=".length));
			if (!Number.isInteger(value) || value <= 0) {
				throw new Error(`Invalid --batch-size value: ${arg}`);
			}
			options.batchSize = value;
			continue;
		}

		if (arg.startsWith("--start-id=")) {
			const value = Number(arg.slice("--start-id=".length));
			if (!Number.isInteger(value) || value < 0) {
				throw new Error(`Invalid --start-id value: ${arg}`);
			}
			options.startId = value;
			continue;
		}

		if (arg.startsWith("--max-rows=")) {
			const value = Number(arg.slice("--max-rows=".length));
			if (!Number.isInteger(value) || value <= 0) {
				throw new Error(`Invalid --max-rows value: ${arg}`);
			}
			options.maxRows = value;
			continue;
		}

		if (arg === "--help") {
			printUsageAndExit(0);
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function printUsageAndExit(code: number): never {
	console.log("Usage: node build/port.js [options]");
	console.log("");
	console.log("Options:");
	console.log("  --batch-size=<n>  Number of SQLite rows to process per batch (default: 1000)");
	console.log("  --start-id=<n>    Start migration strictly after this legacy ID (default: 0)");
	console.log("  --max-rows=<n>    Stop after migrating N rows");
	console.log("  --dry-run         Read/transform only; do not write to MariaDB");
	console.log("  --no-update       Skip hashes already present in MariaDB");
	console.log("  --help            Show this help output");
	process.exit(code);
}

async function main() {
	const options = parseOptions(process.argv.slice(2));
	const sqliteDatabase = new BetterSqlite3(DB_FILE, { readonly: true });
	try {
		const sqliteCountStmt = sqliteDatabase.prepare("SELECT COUNT(*) as count FROM Files WHERE id > ?");
		const sqliteBatchStmt = sqliteDatabase.prepare(
			"SELECT id, fileName, hash, lookup FROM Files WHERE id > ? ORDER BY id ASC LIMIT ?"
		);

		const sourceCount = (sqliteCountStmt.get(options.startId) as { count: number }).count;
		const targetCount = options.maxRows ? Math.min(options.maxRows, sourceCount) : sourceCount;

		let processed = 0;
		let inserted = 0;
		let updated = 0;
		let skipped = 0;
		let lastId = options.startId;

		console.log(`[port] Starting migration from SQLite Files -> MariaDB CDN`);
		console.log(`[port] Source rows after id>${options.startId}: ${sourceCount}`);
		console.log(`[port] Target rows this run: ${targetCount}`);
		console.log(`[port] Mode: ${options.dryRun ? "dry-run" : "write"}, updateExisting=${options.updateExisting}`);

		while (processed < targetCount) {
			const remaining = targetCount - processed;
			const batchLimit = Math.min(options.batchSize, remaining);

			const rows = sqliteBatchStmt.all(lastId, batchLimit) as SqliteFileRow[];
			if (rows.length === 0) break;

			for (const row of rows) {
				processed++;
				lastId = row.id;

				const fileName = sanitizeFileName(row.fileName);
				const type = DeriveContentType(fileName);

				if (options.dryRun) {
					continue;
				}

				const existing = await MariaDatabase.query("SELECT `key` FROM CDN WHERE hash = ? LIMIT 1", [row.hash]) as Array<{ key: string }>;
				if (existing.length > 0 && !options.updateExisting) {
					skipped++;
					continue;
				}

				if (existing.length > 0) {
					await MariaDatabase.query(
						`UPDATE CDN SET \`filename\` = ?, \`type\` = ? WHERE hash = ?`,
						[fileName, type, row.hash],
					);
					updated++;
				} else {
					await MariaDatabase.query(
						`INSERT INTO CDN (\`key\`, \`hash\`, \`filename\`, \`type\`) VALUES (?, ?, ?, ?)`,
						[row.lookup, row.hash, fileName, type],
					);
					inserted++;
				}
			}

			console.log(`[port] Progress ${processed}/${targetCount} (last legacy id=${lastId})`);
		}

		console.log(`[port] Done.`);
		console.log(`[port] Processed: ${processed}`);
		console.log(`[port] Inserted:  ${inserted}`);
		console.log(`[port] Updated:   ${updated}`);
		console.log(`[port] Skipped:   ${skipped}`);
		console.log(`[port] Resume from: --start-id=${lastId}`);
	} finally {
		sqliteDatabase.close();
	}
}

main()
	.catch((error) => {
		console.error("[port] Migration failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {

		await MariaDatabase.destroy();
	});