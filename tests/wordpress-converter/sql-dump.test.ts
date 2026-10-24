// Reading tables straight out of the MariaDB dump WordPress was backed up to,
// without importing it into a database.
import { describe, expect, it } from 'vitest';
import { readSqlDump } from '../../scripts/wordpress-converter/sql-dump';

// The shape mysqldump writes, trimmed from the real backup (^ stands for a
// backtick, to keep this readable as a template string).
const dump = String.raw`-- MariaDB dump 10.19  Distrib 10.4.21-MariaDB, for debian-linux-gnu (x86_64)
/*!40101 SET NAMES utf8 */;

DROP TABLE IF EXISTS ^wp_terms^;
CREATE TABLE ^wp_terms^ (
  ^term_id^ bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  ^name^ varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  ^slug^ varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  ^term_group^ bigint(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (^term_id^),
  KEY ^slug^ (^slug^(191))
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

LOCK TABLES ^wp_terms^ WRITE;
INSERT INTO ^wp_terms^ VALUES (1,'未分類','uncategorized',0),(14,'BOOK☆WALKER','book%e2%98%86walker',0);
INSERT INTO ^wp_terms^ VALUES (75,'It\'s (a) \"test\"; ok','a\\b\nc\r\t',NULL);
UNLOCK TABLES;

CREATE TABLE ^wp_links^ (
  ^link_id^ bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (^link_id^)
) ENGINE=InnoDB;
INSERT INTO ^wp_links^ VALUES (1);
`.replaceAll('^', '`');

describe('reading a SQL dump', () => {
	it('gives the rows of the requested tables, keyed by column name', () => {
		const tables = readSqlDump(dump, ['wp_terms']);

		expect(tables).toEqual({
			wp_terms: [
				{ term_id: '1', name: '未分類', slug: 'uncategorized', term_group: '0' },
				{ term_id: '14', name: 'BOOK☆WALKER', slug: 'book%e2%98%86walker', term_group: '0' },
				{ term_id: '75', name: `It's (a) "test"; ok`, slug: 'a\\b\nc\r\t', term_group: null },
			],
		});
	});

	it('fails for a table the dump does not have', () => {
		expect(() => readSqlDump(dump, ['wp_posts'])).toThrow('wp_posts');
	});
});
