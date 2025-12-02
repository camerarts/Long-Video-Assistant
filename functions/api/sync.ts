
interface Env {
  DB: any;
}

const ensureTables = async (db: any) => {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS inspirations (id TEXT PRIMARY KEY, category TEXT, created_at INTEGER, data TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, data TEXT)")
  ]);
};

export const onRequestPost = async (context: any) => {
  try {
    const db = context.env.DB;
    
    // Auto-migration: Ensure tables exist
    await ensureTables(db);

    const data = await context.request.json();
    const statements = [];

    // Projects
    if (data.projects && Array.isArray(data.projects)) {
      for (const p of data.projects) {
        statements.push(db.prepare(
          `INSERT INTO projects (id, title, status, created_at, updated_at, data) 
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           status = excluded.status,
           updated_at = excluded.updated_at,
           data = excluded.data`
        ).bind(p.id, p.title, p.status, p.createdAt, p.updatedAt, JSON.stringify(p)));
      }
    }

    // Inspirations
    if (data.inspirations && Array.isArray(data.inspirations)) {
      for (const i of data.inspirations) {
        statements.push(db.prepare(
          `INSERT INTO inspirations (id, category, created_at, data) 
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           category = excluded.category,
           data = excluded.data`
        ).bind(i.id, i.category || '未分类', i.createdAt, JSON.stringify(i)));
      }
    }

    // Prompts
    if (data.prompts) {
      statements.push(db.prepare(
        `INSERT INTO prompts (id, data) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`
      ).bind('global_prompts', JSON.stringify(data.prompts)));
    }

    // Execute batch (chunked to avoid limits)
    const chunkSize = 10; // Reduced chunk size for safety
    for (let i = 0; i < statements.length; i += chunkSize) {
        const chunk = statements.slice(i, i + chunkSize);
        if (chunk.length > 0) {
            await db.batch(chunk);
        }
    }

    return Response.json({ success: true, timestamp: Date.now() });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestGet = async (context: any) => {
  try {
    const db = context.env.DB;
    
    // Auto-migration: Ensure tables exist before reading
    await ensureTables(db);

    // Fetch all
    const pRes = await db.prepare("SELECT * FROM projects").all();
    const iRes = await db.prepare("SELECT * FROM inspirations").all();
    const prRes = await db.prepare("SELECT * FROM prompts WHERE id = ?").bind('global_prompts').first();

    const projects = pRes.results.map((r: any) => JSON.parse(r.data));
    const inspirations = iRes.results.map((r: any) => JSON.parse(r.data));
    const prompts = prRes ? JSON.parse(prRes.data as string) : null;

    return Response.json({ projects, inspirations, prompts });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
