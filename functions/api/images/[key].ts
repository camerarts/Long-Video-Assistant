
interface Env {
  BUCKET: any;
}

export const onRequestPut = async (context: any) => {
  const key = context.params.key;
  const url = new URL(context.request.url);
  const projectId = url.searchParams.get('project');

  try {
    if (!context.env.BUCKET) return new Response("R2 Bucket not configured", {status: 500});
    
    // If project ID is provided, store in a folder structure "projectId/filename"
    const storageKey = projectId ? `${projectId}/${key}` : key;
    
    const body = context.request.body; // Stream
    await context.env.BUCKET.put(storageKey, body);
    
    // Return the URL path. We encode the key to treat the path (folder/file) as a single segment 
    // for the [key] route in GET requests.
    const publicUrl = `/api/images/${encodeURIComponent(storageKey)}`;
    return Response.json({ success: true, url: publicUrl });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestGet = async (context: any) => {
  // Decode the key to get the actual R2 path (handling slashed folders)
  const key = decodeURIComponent(context.params.key);
  
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
