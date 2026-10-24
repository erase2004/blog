// YAML frontmatter, written the same way every time: strings double-quoted,
// dates as ISO 8601 timestamps in the site's time zone, lists in flow style.

export type FrontmatterValue = string | number | boolean | Date | string[] | undefined;

/** The frontmatter block for `fields`, in their order; undefined fields are left out. */
export function frontmatter(fields: [string, FrontmatterValue][], timeZone: string): string {
	const lines = fields.flatMap(([key, value]) => {
		if (value === undefined) return [];
		return [`${key}: ${yamlValue(value, timeZone)}`];
	});
	return `---\n${lines.join('\n')}\n---\n`;
}

function yamlValue(value: Exclude<FrontmatterValue, undefined>, timeZone: string): string {
	if (value instanceof Date) return localTimestamp(value, timeZone);
	if (Array.isArray(value)) return `[${value.map(quoted).join(', ')}]`;
	if (typeof value === 'string') return quoted(value);
	return String(value);
}

/** A double-quoted YAML string; invisible format characters are written as escapes. */
function quoted(text: string): string {
	return JSON.stringify(text).replace(
		/[\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
	);
}

/** `2021-09-30T16:23:17+08:00`: the instant as local time in `timeZone`, with its offset. */
export function localTimestamp(date: Date, timeZone: string): string {
	const { year, month, day, hour, minute, second } = localParts(date, timeZone);
	const local = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
	const offset = Math.round((local - date.getTime()) / 60_000);
	const sign = offset < 0 ? '-' : '+';
	const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
	const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
	return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
}

/** The local date and time of an instant in `timeZone`, as zero-padded strings. */
export function localParts(date: Date, timeZone: string): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(date);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return {
		year: part('year'),
		month: part('month'),
		day: part('day'),
		hour: part('hour'),
		minute: part('minute'),
		second: part('second'),
	};
}
