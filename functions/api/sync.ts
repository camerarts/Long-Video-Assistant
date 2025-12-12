

interface Env {
  DB: any;
}

// Helper to ensure tables exist. 
// We run these sequentially to avoid batch transaction quirks during schema creation on D1.
const ensureTables = async (db: any) => {
  const statements = [
    "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)",
    "CREATE TABLE IF NOT EXISTS inspirations (id TEXT PRIMARY KEY, category TEXT, created_at INTEGER, data TEXT)",
    "CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, data TEXT)",
    "CREATE TABLE IF NOT EXISTS tools (id TEXT PRIMARY KEY, data TEXT)"
  ];

  for (const stmt of statements) {
    try {
      await db.prepare(stmt).run();
    } catch (e) {
      console.error("Table creation failed for stmt:", stmt, e);
      // We continue, as the table might already exist or other harmless errors
    }
  }
};

export const onRequestPost = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found. Please check Cloudflare Pages Settings.");

    // Auto-migration
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
    
    // Tools
    if (data.tools && Array.isArray(data.tools)) {
      for (const t of data.tools) {
        statements.push(db.prepare(
          `INSERT INTO tools (id, data) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET data = excluded.data`
        ).bind(t.id, JSON.stringify(t.data)));
      }
    }

    // Execute batch (chunked to avoid limits)
    // Cloudflare D1 has a limit on batch size and statement size.
    // We execute sequentially in chunks to be safe.
    const chunkSize = 5; 
    for (let i = 0; i < statements.length; i += chunkSize) {
        const chunk = statements.slice(i, i + chunkSize);
        if (chunk.length > 0) {
            await db.batch(chunk);
        }
    }

    return Response.json({ success: true, timestamp: Date.now() });
  } catch (err: any) {
    console.error("Sync POST Error:", err);
    return Response.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
};

export const onRequestGet = async (context: any) => {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Database binding 'DB' not found.");
    
    // Auto-migration on read as well, to be safe
    await ensureTables(db);

    // Fetch all
    const pRes = await db.prepare("SELECT * FROM projects").all();
    const iRes = await db.prepare("SELECT * FROM inspirations").all();
    const prRes = await db.prepare("SELECT * FROM prompts WHERE id = ?").bind('global_prompts').first();
    const tRes = await db.prepare("SELECT * FROM tools").all();

    const projects = pRes.results ? pRes.results.map((r: any) => JSON.parse(r.data)) : [];
    const inspirations = iRes.results ? iRes.results.map((r: any) => JSON.parse(r.data)) : [];
    const prompts = prRes ? JSON.parse(prRes.data as string) : null;
    const tools = tRes.results ? tRes.results.map((r: any) => ({ id: r.id, data: JSON.parse(r.data) })) : [];

    return Response.json({ projects, inspirations, prompts, tools });
  } catch (err: any) {
    console.error("Sync GET Error:", err);
    return Response.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
};
