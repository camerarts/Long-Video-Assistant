
interface Env {
  DB: any;
}

export const onRequestGet = async (context: any) => {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM inspirations ORDER BY created_at DESC"
    ).all();
    
    const inspirations = results.map((row: any) => JSON.parse(row.data));
    return Response.json(inspirations);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestPost = async (context: any) => {
  try {
    const item = await context.request.json() as any;
    
    await context.env.DB.prepare(
      `INSERT INTO inspirations (id, category, created_at, data) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       category = excluded.category,
       data = excluded.data`
    ).bind(
      item.id,
      item.category || '未分类',
      item.createdAt,
      JSON.stringify(item)
    ).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
