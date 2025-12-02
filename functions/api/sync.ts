
interface Env {
  BUCKET: any; // R2Bucket binding
}

export const onRequestPost = async (context: any) => {
  try {
    const data = await context.request.json();
    
    // Verify R2 Binding exists
    if (!context.env.BUCKET) {
      return Response.json({ error: "R2 Bucket binding 'BUCKET' not found. Please configure it in Cloudflare Pages settings." }, { status: 500 });
    }

    // Parallel uploads to R2
    await Promise.all([
      context.env.BUCKET.put('projects.json', JSON.stringify(data.projects || [])),
      context.env.BUCKET.put('inspirations.json', JSON.stringify(data.inspirations || [])),
      context.env.BUCKET.put('prompts.json', JSON.stringify(data.prompts || {}))
    ]);

    return Response.json({ success: true, timestamp: Date.now() });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const onRequestGet = async (context: any) => {
  try {
    if (!context.env.BUCKET) {
      return Response.json({ error: "R2 Bucket binding 'BUCKET' not found." }, { status: 500 });
    }

    // Parallel reads from R2
    const [pObj, iObj, prObj] = await Promise.all([
      context.env.BUCKET.get('projects.json'),
      context.env.BUCKET.get('inspirations.json'),
      context.env.BUCKET.get('prompts.json')
    ]);

    const projects = pObj ? await pObj.json() : [];
    const inspirations = iObj ? await iObj.json() : [];
    const prompts = prObj ? await prObj.json() : null;

    return Response.json({ projects, inspirations, prompts });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
