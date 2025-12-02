
interface Env {
  BUCKET: any;
}

export const onRequestPut = async (context: any) => {
  const key = context.params.key;
  try {
    if (!context.env.BUCKET) return new Response("R2 Bucket not configured", {status: 500});
    
    const body = context.request.body; // Stream
    await context.env.BUCKET.put(key, body);
    
    // Return the URL path
    const url = `/api/images/${key}`;
    return Response.json({ success: true, url });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestGet = async (context: any) => {
  const key = context.params.key;
  try {
    if (!context.env.BUCKET) return new Response("R2 Bucket not configured", {status: 500});
    
    const object = await context.env.BUCKET.get(key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
