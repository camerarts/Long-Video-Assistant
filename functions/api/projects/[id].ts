
interface Env {
  DB: any;
}

export const onRequestDelete = async (context: any) => {
  const id = context.params.id;
  
  try {
    await context.env.DB.prepare(
      "DELETE FROM inspirations WHERE id = ?"
    ).bind(id).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
