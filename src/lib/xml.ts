// Writing XML (the feeds and the sitemap) by hand.

const ENTITIES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };

/** Text as XML text or an attribute value. */
export function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (character) => ENTITIES[character]!);
}

/** Text as a CDATA section: HTML stays readable, and shorter than with every `<` escaped. */
export function cdata(text: string): string {
	return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}
