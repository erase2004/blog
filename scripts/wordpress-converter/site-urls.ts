// Links to the site itself.

/** `https://aniya.moe/about/` → `/about/`, with the path decoded to UTF-8; other URLs stay as they are. */
export function siteRelative(href: string, siteOrigin: string): string {
	const host = new URL(siteOrigin).host.replace(/^www\./, '');
	const match = new RegExp(`^(?:https?:)?//(?:www\\.)?${host.replaceAll('.', '\\.')}(?=[/?#]|$)(.*)$`, 'i').exec(href);
	if (!match) return href;
	const rest = match[1] || '/';
	const [, path = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(rest.startsWith('/') ? rest : `/${rest}`)!;
	try {
		return decodeURI(path) + suffix;
	} catch {
		return path + suffix;
	}
}
