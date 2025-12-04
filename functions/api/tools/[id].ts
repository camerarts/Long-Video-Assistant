
interface Env {
  DB: any;
}

export const onRequestGet = async (context: any) => {
  const id = context.params.id;
  
  try {
    const result = await context.env.DB.prepare(
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
