import http from 'node:http';
import {readFile} from 'node:fs/promises';
const objects=new Map();
const bucket={async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null},async put(k,v){objects.set(k,v)},async delete(k){objects.delete(k)},async list({prefix='',startAfter='',limit=1000}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)&&k>startAfter).sort().slice(0,limit).map(key=>({key}))}}};
const code=await readFile('dist/server/index.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
http.createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const response=await worker.fetch(new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(body?{body}: {})}),{BUCKET:bucket,LOCAL_PREVIEW:true},{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){res.writeHead(500);res.end(e.message)}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173 (preview storage is temporary)'));
