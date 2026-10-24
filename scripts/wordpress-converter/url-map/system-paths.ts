// WordPress's admin, login, XML-RPC and REST API paths answer 404.
import type { UrlSource } from '../mapping-table.ts';

export const systemPaths: UrlSource = () => ({
	urls: ['/wp-admin/', '/wp-json/', '/wp-login.php', '/xmlrpc.php'].map((url) => ({ url, expect: 'not-found' as const })),
});
