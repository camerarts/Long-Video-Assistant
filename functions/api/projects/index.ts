
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM projects ORDER BY updated_at DESC"
    ).all();
    
    // Parse the JSON data string back into objects
    const projects = results.map((row: any) => {
      const data = JSON.parse(row.data);
      return data;
    });

    return Response.json(projects);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const project = await context.request.json() as any;
    
    // We store metadata in columns for querying, and the full object in 'data' column
    await context.env.DB.prepare(
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
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
