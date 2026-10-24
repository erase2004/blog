// Reads tables out of a mysqldump/MariaDB dump without a database: the
// columns from each CREATE TABLE, the rows from its INSERT statements.

/** A table row: column name → value as the dump wrote it (`NULL` → null). */
export type Row = Record<string, string | null>;

export type Tables = Record<string, Row[]>;

/** The rows of `tableNames`; throws if the dump lacks one of them. */
export function readSqlDump(sql: string, tableNames: readonly string[]): Tables {
	const tables: Tables = {};
	for (const name of tableNames) {
		const columns = columnsOf(sql, name);
		const rows: Row[] = [];
		const insert = `INSERT INTO \`${name}\` VALUES `;
		for (let at = sql.indexOf(insert); at !== -1; at = sql.indexOf(insert, at)) {
			const { values, end } = readValues(sql, at + insert.length);
			for (const value of values) {
				if (value.length !== columns.length) {
					throw new Error(`${name}: a row has ${value.length} values for ${columns.length} columns`);
				}
				rows.push(Object.fromEntries(columns.map((column, i) => [column, value[i]!])));
			}
			at = end;
		}
		tables[name] = rows;
	}
	return tables;
}

function columnsOf(sql: string, table: string): string[] {
	const create = new RegExp(`^CREATE TABLE \`${table}\` \\(\\n([\\s\\S]*?)\\n\\)`, 'm').exec(sql);
	if (!create) throw new Error(`The dump has no table ${table}`);
	return [...create[1]!.matchAll(/^\s+`([^`]+)`/gm)].map(([, column]) => column!);
}

const ESCAPES: Record<string, string> = { '0': '\0', n: '\n', r: '\r', t: '\t', Z: '\x1a', b: '\b' };

/** Finds the next character that ends a run of plain string content. */
const STRING_SPECIAL = /['\\]/g;
/** Finds the end of an unquoted value (a number or NULL). */
const VALUE_END = /[,)]/g;

/** The rows of one `VALUES (…),(…);` list starting at `start`. */
function readValues(sql: string, start: number): { values: (string | null)[][]; end: number } {
	const unexpected = (at: number) =>
		new Error(`Unexpected ${JSON.stringify(sql.slice(at, at + 20))} in the dump`);
	const values: (string | null)[][] = [];
	let i = start;
	for (;;) {
		if (sql[i] !== '(') throw unexpected(i);
		i++;
		const row: (string | null)[] = [];
		for (;;) {
			if (sql[i] === "'") {
				let text = '';
				i++;
				for (;;) {
					STRING_SPECIAL.lastIndex = i;
					const special = STRING_SPECIAL.exec(sql);
					if (!special) throw new Error('Unterminated string in the dump');
					text += sql.slice(i, special.index);
					i = special.index;
					if (sql[i] === '\\') {
						text += ESCAPES[sql[i + 1]!] ?? sql[i + 1];
						i += 2;
					} else if (sql[i + 1] === "'") {
						text += "'";
						i += 2;
					} else {
						i++;
						break;
					}
				}
				row.push(text);
			} else {
				VALUE_END.lastIndex = i;
				const end = VALUE_END.exec(sql);
				if (!end) throw unexpected(i);
				const token = sql.slice(i, end.index).trim();
				row.push(token === 'NULL' ? null : token);
				i = end.index;
			}
			if (sql[i] === ',') {
				i++;
				continue;
			}
			if (sql[i] !== ')') throw unexpected(i);
			i++;
			break;
		}
		values.push(row);
		if (sql[i] === ',') {
			i++;
			continue;
		}
		if (sql[i] === ';') return { values, end: i + 1 };
		throw unexpected(i);
	}
}
