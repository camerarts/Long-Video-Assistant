interface Env {
  DB: any;
}

export const onRequestGet = async (context: any) => {
  const id = context.params.id;
  
  try {
    const result = await context.env.DB.prepare(
      "SELECT data FROM projects WHERE id = ?"
    ).bind(id).first();

    if (!result) {
      return new Response("Not Found", { status: 404 });
    }

    const project = JSON.parse(result.data as string);
    return Response.json(project);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestDelete = async (context: any) => {
  const id = context.params.id;
  
  try {
    await context.env.DB.prepare(
      "DELETE FROM projects WHERE id = ?"
    ).bind(id).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
