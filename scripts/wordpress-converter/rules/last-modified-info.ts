// `[lmt-post-modified-info]` (WP Last Modified Info) is left out: the layout
// shows every post's last update from its `updated` field.
import type { Rule } from '../rule.ts';

export const lastModifiedInfo: Rule = {
	shortcodes: { 'lmt-post-modified-info': () => '' },
};
