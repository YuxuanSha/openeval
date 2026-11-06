import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from './store.ts';
export function publicAddress(address:string){
  if(isIP(address)===4){const p=address.split('.').map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===198&&(p[1]===18||p[1]===19)));}
  if(isIP(address)===6){const a=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(a)&&!a.startsWith('2001:db8:');}return false;
}
export async function fetchLink(raw:string,redirects=0):Promise<{bytes:Buffer;mime:string;url:string}>{
  let url:URL;try{url=new URL(raw);}catch{throw new AppError(400,'INVALID_URL','链接格式无效');}
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new AppError(400,'URL_POLICY','请使用不含账号信息的公开HTTPS链接');
  let addresses;try{addresses=await lookup(url.hostname,{all:true});}catch{throw new AppError(422,'LINK_UNREACHABLE','无法解析或访问此链接，请导入文件或粘贴内容');}
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new AppError(422,'LINK_PRIVATE','此链接指向受限地址，请通过已授权连接器取得文件后导入');
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{lookup:((_hostname:any,options:any,callback:any)=>{const picked=addresses[0];options?.all?callback(null,[picked]):callback(null,picked.address,picked.family);}) as any,headers:{'User-Agent':'OpenEval/0.2','Accept':'text/*,application/json,application/pdf'},timeout:15000},res=>{
      if(res.statusCode&&res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(redirects>=3){reject(new AppError(422,'LINK_REDIRECT','链接重定向过多'));return;}fetchLink(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();reject(new AppError(422,'LINK_HTTP',`链接读取失败（HTTP ${res.statusCode}），未导入资料`));return;}
      let length=0;const chunks:Buffer[]=[];res.on('data',chunk=>{length+=chunk.length;if(length>40*1024*1024){req.destroy();reject(new AppError(413,'LINK_SIZE','链接内容超过40MB'));}else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{const bytes=Buffer.concat(chunks);const mime=(res.headers['content-type']??'application/octet-stream').split(';')[0];if(mime==='text/html'&&/<title>[^<]*(?:sign in|log in|登录|登陆)|<form[^>]+(?:login|signin)/i.test(bytes.toString('utf8'))){reject(new AppError(422,'LINK_AUTH','链接返回登录页，尚未取得正文。请使用已授权连接器导出后上传。'));return;}resolve({bytes,mime,url:url.href});});
    });req.on('timeout',()=>req.destroy(new Error('请求超时')));req.on('error',()=>reject(new AppError(422,'LINK_UNREACHABLE','链接读取失败或超时，未导入资料。可上传文件或粘贴内容。')));
  });
}
