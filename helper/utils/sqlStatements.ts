/**
 * SQL ファイルを「実行可能な1文」の配列に分割する。
 *
 * Prisma の $executeRawUnsafe は1回に1文しか送れないため、
 * prisma/manual-migrations.sql をそのまま渡せない。単純に ";" で切ると
 * `DO $$ ... END $$;` の内側のセミコロンで壊れるので、以下を考慮して切る。
 *
 *  - 行コメント      `-- …` 改行まで
 *  - ブロックコメント `/* … *\/`（ネストしない前提。Postgres は入れ子も許すが
 *                     このリポジトリの SQL では使っていない）
 *  - 文字列リテラル   `'…'`（`''` でエスケープ）
 *  - ドル引用符       `$$ … $$` / `$tag$ … $tag$`
 *
 * コメントは実行に不要なので落とす。結果として空になった塊は返さない。
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  while (i < n) {
    const c = sql[i];

    // 行コメント: 改行手前まで読み捨てる（改行自体は残して整形を保つ）
    if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }

    // ブロックコメント
    if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }

    // 文字列リテラル（'' は文字列中のシングルクォート）
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // ドル引用符（$$ … $$ / $tag$ … $tag$）。中のセミコロンでは切らない。
    const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const end = close === -1 ? n : close + tag.length;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }

    // 文の区切り
    if (c === ";") {
      flush();
      i += 1;
      continue;
    }

    buf += c;
    i += 1;
  }

  // 末尾のセミコロン無し文も拾う
  flush();
  return out;
}
