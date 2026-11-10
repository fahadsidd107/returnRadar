import * as SQLite from "expo-sqlite";
let draftDb: Promise<SQLite.SQLiteDatabase> | null = null;
export async function database() {
  if (!draftDb)
    draftDb = SQLite.openDatabaseAsync("radar-drafts.db").then(async (db) => {
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS drafts (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      return db;
    });
  return draftDb;
}
