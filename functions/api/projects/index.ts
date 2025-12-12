
interface Env {
  DB: any;
}

const ensureTable = async (db: any) => {
  await db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)").run();
};

export const onRequestGet = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");
    
    await ensureTable(db);

    const { results } = await db.prepare(
      "SELECT * FROM projects ORDER BY updated_at DESC"
    ).all();
    
    const projects = results.map((row: any) => {
      try {
        return JSON.parse(row.data);
      } catch {
        return null;
      }
    }).filter((p: any) => p !== null);

    return Response.json(projects);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestPost = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");

    await ensureTable(db);

    const project = await context.request.json() as any;
    
    await db.prepare(
      `INSERT INTO projects (id, title, status, created_at, updated_at, data) 
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       status = excluded.status,
       updated_at = excluded.updated_at,
       data = excluded.data`
    ).bind(
      project.id,
      project.title,
      project.status,
      project.createdAt,
      project.updatedAt,
      JSON.stringify(project)
    ).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
