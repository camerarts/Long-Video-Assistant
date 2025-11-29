
interface Env {
  DB: D1Database;
}

const KEY = 'global_prompts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const result = await context.env.DB.prepare(
      "SELECT data FROM prompts WHERE id = ?"
    ).bind(KEY).first();

    if (!result) {
      return Response.json(null); // Return null to let frontend use defaults
    }

    return Response.json(JSON.parse(result.data as string));
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const prompts = await context.request.json();
    
    await context.env.DB.prepare(
      `INSERT INTO prompts (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).bind(KEY, JSON.stringify(prompts)).run();

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
