import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";

import { z } from "zod";
import knex from "knex";

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrationsDirectoryPath = "";
const seedssDirectoryPath = "";
const appName = "";
const extension = ".js";

async function createDir(dirPath) {
	//const dirPath = path.join(__dirname, 'my/nested/folder');

	try {
		// If the directory already exists, this does nothing and succeeds safely
		await mkdir(dirPath, { recursive: true });
		//console.log('✅ Directory is ready (created or already existed).');
	} catch (err) {
		throw new Error(`❌ Error creating directory: ${err}`);
	}
}

/* const db = knex({
	debug: true,
	acquireConnectionTimeout: undefined,
	asyncStackTraces: undefined,
	client: "better-sqlite3",
	compileSqlOnError: undefined,
	connection: {
		filename: "",
		//..... TO CHECK other available options for sqlite (better-sqlite3)
	},
	connectionPool: undefined,
	defaultDateTimePrecision: undefined, // Valid only on PostgreSQL and CockroachDB
	dialect: undefined,
	fetchAsString: undefined,
	jsonbSupport: undefined,
	log: {
		debug: (message) => {
			console.log(`DEBUG: ${JSON.stringify(message, null, 2)}`);
		},
		deprecate: (method, alternative) => {
			console.log(`DEBRECATED: ${method}\nALTERNATIVE: ${alternative}`);
		},
		warn: (message) => {
			console.log(`WARN: ${JSON.stringify(message, null, 2)}`);
		},
		error: (message) => {
			console.log(`ERROR: ${JSON.stringify(message, null, 2)}`);
		},
		enableColors: true,
		inspectionDepth: undefined, //??????
	},
	migrations: {
		directory: migrationsDirectoryPath,
		extension,
		tableName: `${appName}_migrations`,
	},
	seeds: {
		directory: seedssDirectoryPath,
		extension,
	},
	useNullAsDefault: true,
}); */

const createOrConnectDb = async (appName, extension = ".js") => {
	try {
		await createDir(join(__dirname, "..", "databases", appName));
		const db = knex({
			debug: true,
			acquireConnectionTimeout: undefined,
			asyncStackTraces: undefined,
			client: "better-sqlite3",
			compileSqlOnError: undefined,
			connection: {
				filename: join(
					__dirname,
					"..",
					"databases",
					appName,
					"database.db",
				),
				//..... TO CHECK other available options for sqlite (better-sqlite3)
			},
			connectionPool: undefined,
			defaultDateTimePrecision: undefined, // Valid only on PostgreSQL and CockroachDB
			dialect: undefined,
			fetchAsString: undefined,
			jsonbSupport: undefined,
			log: {
				debug: (message) => {
					console.log(`DEBUG: ${JSON.stringify(message, null, 2)}`);
				},
				deprecate: (method, alternative) => {
					console.log(
						`DEBRECATED: ${method}\nALTERNATIVE: ${alternative}`,
					);
				},
				warn: (message) => {
					console.log(`WARN: ${JSON.stringify(message, null, 2)}`);
				},
				error: (message) => {
					console.log(`ERROR: ${JSON.stringify(message, null, 2)}`);
				},
				enableColors: true,
				inspectionDepth: undefined, //??????
			},
			migrations: {
				directory: join(
					__dirname,
					"..",
					"databases",
					appName,
					"migrations",
				),
				extension,
				//tableName: `${appName}_migrations`,
			},
			seeds: {
				directory: join(__dirname, "..", "databases", appName, "seeds"),
				extension,
			},
			useNullAsDefault: true,
		});
		await db.raw("SELECT 1+1 AS result");
		console.log("✅ Database connection successful.");
		// await db.destroy();
		return db;
	} catch (error) {
		console.error("❌ Database connection failed:", error.message);
	}
};

const db = knex({
	debug: true,
	// acquireConnectionTimeout: undefined,
	// asyncStackTraces: undefined,
	client: "better-sqlite3",
	// compileSqlOnError: undefined,
	connection: {
		filename: join(__dirname, "..", "databases", "testing", "database.db"),
		//..... TO CHECK other available options for sqlite (better-sqlite3)
	},
	// connectionPool: undefined,
	// defaultDateTimePrecision: undefined, // Valid only on PostgreSQL and CockroachDB
	// dialect: undefined,
	// fetchAsString: undefined,
	// jsonbSupport: undefined,
	log: {
		debug: (message) => {
			console.log(`DEBUG: ${JSON.stringify(message, null, 2)}`);
		},
		deprecate: (method, alternative) => {
			console.log(`DEBRECATED: ${method}\nALTERNATIVE: ${alternative}`);
		},
		warn: (message) => {
			console.log(`WARN: ${JSON.stringify(message, null, 2)}`);
		},
		error: (message) => {
			console.log(`ERROR: ${JSON.stringify(message, null, 2)}`);
		},
		enableColors: true,
		// inspectionDepth: undefined, //??????
	},
	migrations: {
		directory: join(__dirname, "..", "databases", appName, "migrations"),
		extension,
		//tableName: `${appName}_migrations`,
	},
	seeds: {
		directory: join(__dirname, "..", "databases", appName, "seeds"),
		extension,
	},
	useNullAsDefault: true,
});

/**
 * Creates a new table if not exist
 * @param {string} tableName
 * @param {"autoincrement"|"uuid"|"binaryuuid"} [pkType="autoincrement"] Default: "autoincrement"
 * @param {string} [pkName="id"] Default: "id"
 */
const createTable = async (
	tableName,
	pkType = "autoincrement",
	pkName = "id",
) => {
	try {
		const present = await db.schema.hasTable(tableName);

		if (!!present) {
			throw new Error(`Table "${tableName}" is already exists`);
		}
		await db.schema.createTable(tableName, (tb) => {
			let pk;
			if (pkType === "autoincrement") {
				pk = tb.increments(pkName, { primaryKey: true }).primary();
			} else if (pkType === "uuid") {
				pk = tb
					.uuid(pkName, { primaryKey: true, useBinaryUuid: false })
					.primary();
			} else if (pkType === "binaryuuid") {
				pk = tb
					.uuid(pkName, { primaryKey: true, useBinaryUuid: true })
					.primary();
			} else {
				throw new Error(
					`pkType must be "autoincrement"|"uuid"|"binaryuuid"`,
				);
			}
		});
	} catch (error) {
		console.error(error);
	} finally {
		await db.destroy();
	}
};

const addColumnToTable = async (
	tableName,
	columnName,
	dataType,
	unique = false,
	index = false,
	defaultValue = undefined,
	notNullable = false,
	isPositive = false,
	isNegative = false,
	rangeStart = undefined,
	rangeEnd = undefined,
	regex = undefined,
	enumValues = [],
	notInValues = [],
	stringLength = undefined,
) => {
	try {
		const tablePresent = await db.schema.hasTable(tableName);

		if (!tablePresent) {
			throw new Error(`Table "${tableName}" does NOT exist`);
		}

		const columnPresent = await db.schema.hasColumn(tableName, columnName);
		if (!!columnPresent) {
			throw new Error(
				`Column "${columnName}" already exixts in Table "${tableName}"`,
			);
		}

		if (notNullable) {
			if (defaultValue == null) {
				throw new Error(
					`notNullable Column can not have null as default value`,
				);
			}
		}

		// Only numerical data types

		if (isPositive && isNegative) {
			throw new Error(
				`Column can not be isPositive and isNegative at the same time`,
			);
		}

		if (isNegative && defaultValue > 0) {
			throw new Error(
				`Column can not isNegative and have default positive defaultValue = ${defaultValue}`,
			);
		}

		if (isPositive && defaultValue < 0) {
			throw new Error(
				`Column can not isPositive and have default negative defaultValue = ${defaultValue}`,
			);
		}

		if (defaultValue && defaultValue < rangeStart) {
			throw new Error(
				`Column defaultValue = ${defaultValue} is less than its rangeStart = ${rangeStart}`,
			);
		}

		if (defaultValue && defaultValue > rangeEnd) {
			throw new Error(
				`Column defaultValue = ${defaultValue} is more than its rangeEnd = ${rangeEnd}`,
			);
		}

		// All data types

		if (defaultValue && enumValues && enumValues.length > 0) {
			if (!enumValues.includes(defaultValue)) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is not one of the enumValues = ${JSON.stringify(enumValues)}`,
				);
			}
		}

		if (defaultValue && notInValues && notInValues.length > 0) {
			if (notInValues.includes(defaultValue)) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is one of the notInValues = ${JSON.stringify(notInValues)}`,
				);
			}
		}

		await db.schema.alterTable(tableName, (tb) => {
			let col;
			if (dataType === "bigint") {
				//col = tb.bigint(c);////
				col = tb.bigint(columnName);
			} else if (dataType === "binary") {
				col = tb.binary(columnName);
			} else if (dataType === "boolean") {
				col = tb.boolean(columnName);
			} else if (dataType === "date") {
				col = tb.date(columnName);
			} else if (dataType === "datetime") {
				col = tb.datetime(columnName, {
					useTz: false, //////
					precision: 8, //////////////
				});
			} else if (dataType === "decimal") {
				col = tb.decimal(columnName, 8 /****** */, 4 /****** */);
			} else if (dataType === "float") {
				col = tb.float(columnName, 8 /****** */, 4 /****** */);
			} else if (dataType === "geography") {
				col = tb.geography(columnName);
			} else if (dataType === "geometry") {
				col = tb.geometry(columnName);
			} else if (dataType === "integer") {
				col = tb.integer(columnName);
			} else if (dataType === "json") {
				col = tb.json(columnName);
			} else if (dataType === "point") {
				col = tb.point(columnName);
			} else if (dataType === "string") {
				col = tb.string(columnName, stringLength);
			} else if (dataType === "text") {
				col = tb.text(columnName);
			} else if (dataType === "time") {
				col = tb.time(columnName);
			} else if (dataType === "time") {
				col = tb.tinyint(columnName);
			} else if (dataType === "uuid") {
				col = tb.uuid(columnName, {
					useBinaryUuid: false,
					primaryKey: false,
				});
			} else if (dataType === "binaryUuid") {
				col = tb.uuid(columnName, {
					useBinaryUuid: true,
					primaryKey: false,
				});
			}

			if (index) {
				col = col.index();
			}
			if (unique) {
				col = col.unique();
			}
			if (notNullable) {
				col = col.notNullable();
			} else {
				col = col.nullable();
			}

			if (defaultValue) {
				col = col.defaultTo(defaultValue).checkBetween([]);
			}

			if (isPositive) {
				col = col.checkPositive();
			}
			if (isNegative) {
				col = col.checkNegative;
			}
			if (regex) {
				col = col.checkRegex(regex);
			}
			if (rangeStart && rangeEnd) {
				col = col.checkBetween([rangeStart, rangeEnd]);
			}

			if (enumValues && enumValues.length > 0) {
				col = col.checkIn(enumValues);
			}
			if (notInValues && notInValues.length > 0) {
				col = col.checkNotIn(notInValues);
			}
		});
	} catch (error) {}
};

/**
 * @typedef {object} BigintColumnCreate
 * @property {string} tableName
 * @property {string} columnName
 * @property {booleanundefined} [isUnique=false] Default is false
 * @property {boolean|undefined} [isIndexed=false] Default is false
 * @property {number|undefined} [defaultValue=undefined]
 * @property {boolean|undefined} [isNotNullable=false] Default is false
 * @property {"isPositive"|"isNegative"|"unsigned"|undefined} [sign=undefined] Default is undefined
 * @property {number|undefined} [rangeStart=undefined] Default is undefined
 * @property {number|undefined} [rangeEnd=undefined] Default is undefined
 * @property {string|undefined} [regex=undefined] Default is undefined
 * @property {number[]|undefined} [enumValues=undefined] Default is undefined
 * @property {number[]|undefined} [notInValues=undefined] Default is undefined
 */

const bigintColumnSchema = z.object({
	tableName: z.string().nonempty().nonoptional().describe("Table name"),
	columnName: z.string().nonempty().nonoptional().describe("Column name"),
	isUnique: z.boolean().default(false).optional(),
	defaultValue: z.number().optional().default(null),
	isNotNullable: z.boolean().default(false).optional(),
	sign: z
		.literal(["isPositive", "isNegative", "unsigned", undefined])
		.default(undefined)
		.optional(),
	rangeStart: z.number().optional().default(undefined),
	rangeEnd: z.number().optional().default(undefined),
	regex: z.string().optional().default(undefined),
	enumValues: z.array(z.number()).optional(),
	notInValues: z.array(z.number()).optional(),
});

/**
 * Add a new bigint column
 * @param {BigintColumnCreate} bigintColumnCreateProps
 */
const addBigintColumnToTable = async ({
	tableName,
	columnName,
	isUnique = false,
	isIndexed = false,
	defaultValue = undefined,
	isNotNullable = false,
	sign = undefined,
	rangeStart = undefined,
	rangeEnd = undefined,
	regex = undefined,
	enumValues = [],
	notInValues = [],
}) => {
	try {
		const tablePresent = await db.schema.hasTable(tableName);

		if (!tablePresent) {
			throw new Error(`Table "${tableName}" does NOT exist`);
		}

		const columnPresent = await db.schema.hasColumn(tableName, columnName);
		if (!!columnPresent) {
			throw new Error(
				`Column "${columnName}" already exixts in Table "${tableName}"`,
			);
		}

		if (notNullable) {
			if (defaultValue == null) {
				throw new Error(
					`notNullable Column can not have null as default value`,
				);
			}
		}

		// Only numerical data types

		if (isPositive && isNegative) {
			throw new Error(
				`Column can not be isPositive and isNegative at the same time`,
			);
		}

		if (sign == "isNegative" && defaultValue >= 0) {
			throw new Error(
				`Column can not isNegative and have default positive defaultValue = ${defaultValue}`,
			);
		}

		if (sign == "isPositive" && defaultValue <= 0) {
			throw new Error(
				`Column can not isPositive and have default negative defaultValue = ${defaultValue}`,
			);
		}
		if (sign == "unsigned" && defaultValue < 0) {
			throw new Error(
				`Column can not unsigned and have default negative defaultValue = ${defaultValue}`,
			);
		}
		if (rangeStart && rangeEnd) {
			if (rangeEnd <= rangeStart) {
				throw new Error(`rangeEnd <= rangeStart`);
			}

			if (defaultValue && defaultValue < rangeStart) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is less than its rangeStart = ${rangeStart}`,
				);
			}

			if (defaultValue && defaultValue > rangeEnd) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is more than its rangeEnd = ${rangeEnd}`,
				);
			}
		}

		// All data types

		if (defaultValue && enumValues && enumValues.length > 0) {
			if (!enumValues.includes(defaultValue)) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is not one of the enumValues = ${JSON.stringify(enumValues)}`,
				);
			}
		}

		if (defaultValue && notInValues && notInValues.length > 0) {
			if (notInValues.includes(defaultValue)) {
				throw new Error(
					`Column defaultValue = ${defaultValue} is one of the notInValues = ${JSON.stringify(notInValues)}`,
				);
			}
		}

		await db.schema.alterTable(tableName, (tb) => {
			let col = tb.bigint(columnName);

			if (isIndexed) {
				col = col.index();
			}
			if (isUnique) {
				col = col.unique();
			}
			if (isNotNullable) {
				col = col.notNullable();
			} else {
				col = col.nullable();
			}

			if (defaultValue) {
				col = col.defaultTo(defaultValue);
			}

			if (sign == "isNegative") {
				col = col.checkNegative();
			} else if (sign == "isPositive") {
				col = col.checkPositive();
			} else if (sign == "unsigned") {
				col = col.unsigned();
			}
			if (regex) {
				col = col.checkRegex(regex);
			}
			if (rangeStart && rangeEnd) {
				col = col.checkBetween([rangeStart, rangeEnd]);
			}

			if (enumValues && enumValues.length > 0) {
				col = col.checkIn(enumValues);
			}
			if (notInValues && notInValues.length > 0) {
				col = col.checkNotIn(notInValues);
			}
		});
	} catch (error) {
		throw new Error(`Error creating bigint column: ${error}`);
	}
};

// for numbers: checkBetween ([rangeStart, rangeEnd])

// for text: checkLength

// checkRegex

// dropChecks([checkName])
