
interface Env {
  DB: any;
}

const ensureTable = async (db: any) => {
  await db.prepare("CREATE TABLE IF NOT EXISTS tools (id TEXT PRIMARY KEY, data TEXT)").run();
};

export const onRequestGet = async (context: any) => {
  const id = context.params.id;
  
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");

    await ensureTable(db);

    const result = await db.prepare(
      "SELECT data FROM tools WHERE id = ?"
    ).bind(id).first();

    if (!result) {
      return Response.json(null);
    }

    const data = JSON.parse(result.data as string);
    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
