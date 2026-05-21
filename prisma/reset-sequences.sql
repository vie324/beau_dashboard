-- Reset all "id" serial/identity sequences in the public schema so that
-- nextval() returns a value greater than the current MAX(id). Run this
-- after bulk-importing rows with explicit ids (e.g. seed, restore) to
-- prevent "duplicate key value violates unique constraint" errors on
-- subsequent INSERTs.
DO $$
DECLARE
  r record;
  seq_name text;
  max_id bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'id'
      AND NOT a.attisdropped
  LOOP
    seq_name := pg_get_serial_sequence(
      format('%I.%I', 'public', r.tbl), 'id'
    );
    IF seq_name IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT COALESCE(MAX("id"), 0) FROM %I.%I', 'public', r.tbl)
      INTO max_id;
    IF max_id > 0 THEN
      EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_id);
    ELSE
      EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
    END IF;
  END LOOP;
END $$;
