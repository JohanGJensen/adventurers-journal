import { describe, expect, test } from 'bun:test';
import { openSqlite } from './sqlite';

const open = () => openSqlite(':memory:');

describe('sqlite adapter (node:sqlite)', () => {
  test('get returns null for no row, binds booleans as 1/0', () => {
    const db = open();
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, flag INTEGER NOT NULL)');
    expect(db.query('SELECT * FROM t WHERE id = ?').get(1)).toBeNull();
    db.query('INSERT INTO t (id, flag) VALUES (?, ?)').run(1, true);
    expect({ ...(db.query('SELECT flag FROM t WHERE id = ?').get(1) as object) }).toEqual({ flag: 1 });
  });

  test('nested transaction failure rolls back only the inner part', () => {
    const db = open();
    db.exec('CREATE TABLE t (v INTEGER)');
    const ins = (v: number) => db.query('INSERT INTO t (v) VALUES (?)').run(v);
    db.transaction(() => {
      ins(1);
      expect(() =>
        db.transaction(() => {
          ins(2);
          throw new Error('inner');
        })(),
      ).toThrow('inner');
      ins(3);
    })();
    expect(db.query('SELECT v FROM t ORDER BY v').all().map((r: any) => r.v)).toEqual([1, 3]);
  });

  test('outer failure rolls back everything', () => {
    const db = open();
    db.exec('CREATE TABLE t (v INTEGER)');
    expect(() =>
      db.transaction(() => {
        db.query('INSERT INTO t (v) VALUES (?)').run(1);
        throw new Error('outer');
      })(),
    ).toThrow('outer');
    expect(db.query('SELECT count(*) AS n FROM t').get()).toEqual({ n: 0 });
  });

  test('a failed COMMIT rolls back and later transactions still work', () => {
    const db = open();
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE p (id INTEGER PRIMARY KEY);
      CREATE TABLE c (pid INTEGER REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED)`);
    // The deferred FK violation only surfaces at COMMIT.
    expect(() => db.transaction(() => db.query('INSERT INTO c (pid) VALUES (?)').run(9))()).toThrow();
    expect(db.query('SELECT count(*) AS n FROM c').get()).toEqual({ n: 0 });
    db.transaction(() => {
      db.query('INSERT INTO p (id) VALUES (?)').run(1);
      db.transaction(() => db.query('INSERT INTO c (pid) VALUES (?)').run(1))();
    })();
    expect(db.query('SELECT count(*) AS n FROM c').get()).toEqual({ n: 1 });
  });
});
