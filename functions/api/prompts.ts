
interface Env {
  DB: any;
}

const KEY = 'global_prompts';

const ensureTable = async (db: any) => {
  await db.prepare("CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, data TEXT)").run();
};

export const onRequestGet = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");

    await ensureTable(db);

    const result = await db.prepare(
      "SELECT data FROM prompts WHERE id = ?"
    ).bind(KEY).first();

    if (!result) {
      return Response.json(null);
    }

    return Response.json(JSON.parse(result.data as string));
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestPost = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");

    await ensureTable(db);

    const prompts = await context.request.json();
    
    await db.prepare(
      `INSERT INTO prompts (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).bind(KEY, JSON.stringify(prompts)).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
