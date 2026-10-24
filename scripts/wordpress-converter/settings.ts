// Settings of the WordPress converter. Paths are relative to the project root.

/** The SQL backup of the WordPress site. Read only; override with an argument to the command. */
export const WORDPRESS_DUMP = 'D:/wordpress-backup/wordpress-2026-10-24-23e0c01.sql';

/** The uploads directory of the backup, where the images are copied from. Read only; override with a second argument. */
export const WORDPRESS_UPLOADS = 'D:/wordpress-backup/wp-content/uploads';

/** The site's origin; links to it become site-relative paths. Must equal the WordPress `home` option. */
export const SITE_ORIGIN = 'https://aniya.moe';
