// Public CC0 files only. This worker has no private project or account bindings.
export default {
  async fetch(request, env) {
    if(new URL(request.url).pathname.startsWith('/admin/'))return upload(request,env);
    const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS","Access-Control-Allow-Headers":"Range, If-None-Match","Access-Control-Expose-Headers":"Content-Range, Content-Length, ETag, Accept-Ranges"};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:cors});
    const path=new URL(request.url).pathname;
    if(path!=='/texas/current.json'&&!/^\/texas\/versions\/[a-f0-9]{16}\/(?:manifest\.json|part-\d{4}\.fgb|unmapped-\d{4}\.parquet)$/.test(path))return new Response('Not found',{status:404,headers:cors});
    const range=request.headers.get('Range');
    if(range&&!/^bytes=\d+-\d*$/.test(range))return new Response('Unsupported byte range',{status:416,headers:cors});
    const object= request.method==='HEAD' ? await env.PARCELS.head(path.slice(1)) : await env.PARCELS.get(path.slice(1),range?{range:request.headers}:{});
    if(!object)return new Response('Dataset not yet published',{status:404,headers:cors});
    const headers=new Headers(cors);
    object.writeHttpMetadata(headers);
    headers.set('ETag',object.httpEtag);
    headers.set('Accept-Ranges','bytes');
    headers.set('Content-Type',path.endsWith('.json')?'application/json':path.endsWith('.fgb')?'application/flatgeobuf':'application/octet-stream');
    headers.set('Cache-Control',path.endsWith('/current.json')?'public, max-age=60':'public, max-age=31536000, immutable');
    let status=200;
    if(object.range){
      const {offset=0,length}=object.range;
      headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${object.size}`);
      headers.set('Content-Length',String(length));status=206;
    } else headers.set('Content-Length',String(object.size));
    return new Response(request.method==='HEAD'?null:object.body,{status,headers});
  }
};

// A dedicated rotatable publisher secret authorizes only this public-data bucket.
async function upload(request,env){
  if(!env.PUBLISH_TOKEN || request.headers.get('Authorization')!==`Bearer ${env.PUBLISH_TOKEN}`)return new Response('Unauthorized',{status:401});
  const url=new URL(request.url),key=url.searchParams.get('key') ?? '';
  if(key!=='texas/current.json'&&!/^texas\/versions\/[a-f0-9]{16}\/(manifest\.json|part-\d{4}\.fgb|unmapped-\d{4}\.parquet)$/.test(key))return new Response('Invalid key',{status:400});
  try {
    if(request.method==='POST'&&url.pathname==='/admin/start'){
      const item=await env.PARCELS.createMultipartUpload(key);
      return Response.json({uploadId:item.uploadId});
    }
    if(request.method==='PUT'&&url.pathname==='/admin/part'){
      const part=Number(url.searchParams.get('part'));
      if(!Number.isInteger(part)||part<1||part>1000||!request.body)return new Response('Invalid part',{status:400});
      const item=env.PARCELS.resumeMultipartUpload(key,url.searchParams.get('uploadId'));
      return Response.json(await item.uploadPart(part,request.body));
    }
    if(request.method==='POST'&&url.pathname==='/admin/complete'){
      const item=env.PARCELS.resumeMultipartUpload(key,url.searchParams.get('uploadId'));
      const parts=await request.json();
      if(!Array.isArray(parts)||parts.length>1000)return new Response('Invalid parts',{status:400});
      await item.complete(parts);
      return Response.json({ok:true});
    }
    if(request.method==='DELETE'&&url.pathname==='/admin/abort'){
      await env.PARCELS.resumeMultipartUpload(key,url.searchParams.get('uploadId')).abort();
      return Response.json({ok:true});
    }
    return new Response('Method not allowed',{status:405});
  }catch{return new Response('Public dataset upload failed',{status:502});}
}
