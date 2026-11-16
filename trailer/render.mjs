
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
const require=createRequire('/tmp/paradox-render/package.json');
const {chromium}=require('playwright');
const root=process.cwd(),out=resolve(root,'trailer');
await mkdir('/tmp/paradox-frames',{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let p=resolve(root,'.'+pathname);if(!p.startsWith(root+'/'))throw Error('path');
  if((await stat(p)).isDirectory())p=resolve(p,'index.html');
  res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(await readFile(p));
 }catch{res.writeHead(404);res.end('Not found')}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/trailer/?render',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.PARADOX_TRAILER);
 const info=await page.evaluate(()=>({version:PARADOX_TRAILER.version,duration:PARADOX_TRAILER.duration,fps:PARADOX_TRAILER.fps}));
 if(info.duration!==30||info.fps!==60)throw Error('Unexpected video specification');
 console.log('Rendering original soundtrack...');
 const wav=await page.evaluate(()=>PARADOX_TRAILER.audio());
 await writeFile('/tmp/paradox-score.wav',Buffer.from(wav,'base64'));
 const sampleTimes=[1.15,4.4,7.2,13.1,16.8,28.8];
 for(let i=0;i<sampleTimes.length;i++){
  const data=await page.evaluate(t=>{PARADOX_TRAILER.render(t);return document.getElementById('film').toDataURL('image/jpeg',.95).split(',')[1]},sampleTimes[i]);
  await writeFile('/tmp/paradox-frames/'+i+'.jpg',Buffer.from(data,'base64'));
 }
 await writeFile(resolve(out,'preview.jpg'),await readFile('/tmp/paradox-frames/5.jpg'));
 execFileSync('ffmpeg',['-y','-framerate','1','-i','/tmp/paradox-frames/%d.jpg','-vf','scale=360:640,tile=3x2','-frames:v','1','-q:v','2',resolve(out,'preview-sheet.jpg')],{stdio:'pipe'});
 await page.evaluate(()=>PARADOX_TRAILER.reset());
 console.log('Rendering 1800 frames at 720x1280 / 60 fps...');
 const movie=resolve(out,'PARADOX-cinematic.mp4');
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate','60','-vcodec','mjpeg','-i','pipe:0','-i','/tmp/paradox-score.wav','-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','19','-profile:v','high','-level','4.2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-14:TP=-1.5:LRA=9','-t','30','-movflags','+faststart',movie],{stdio:['pipe','inherit','inherit']});
 let pipeError;ff.stdin.on('error',e=>{pipeError=e});
 const finished=once(ff,'close');
 for(let n=0;n<1800;n++){
  if(pipeError)throw pipeError;
  const frame=await page.evaluate(t=>{PARADOX_TRAILER.render(t);return document.getElementById('film').toDataURL('image/jpeg',.96).split(',')[1]},n/60);
  if(!ff.stdin.write(Buffer.from(frame,'base64')))await once(ff.stdin,'drain');
  if(n%300===0)console.log('Frames '+n+'/1800');
 }
 ff.stdin.end();const [code]=await finished;if(code!==0)throw Error('ffmpeg exited '+code);
 if(errors.length)throw Error('Browser errors: '+errors.join('; '));
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',movie],{encoding:'utf8'}));
 const video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
 if(video.width!==720||video.height!==1280||video.avg_frame_rate!=='60/1'||audio.codec_name!=='aac'||Math.abs(Number(probe.format.duration)-30)>.1)throw Error('Invalid MP4');
 const snapshots=[];
 for(const t of [1.2,4.5,7.4,10.8,13.2,17.2,20.4,24.0,26.7]){
  snapshots.push(await page.evaluate(t=>{PARADOX_TRAILER.render(t);return {t,...PARADOX_TRAILER.snapshot()}},t));
 }
 if(snapshots.some(s=>s.hull<=0))throw Error('A featured gameplay clip ended before its cut');
 if(!snapshots.some(s=>s.combo===5)||!snapshots.some(s=>s.relays>0)||!snapshots.some(s=>s.near>0))throw Error('Missing featured gameplay event');
 const html=await readFile(resolve(out,'index.html'));
 const manifest={version:info.version,width:720,height:1280,fps:60,duration:30,bytes:(await stat(movie)).size,videoCodec:video.codec_name,audioCodec:audio.codec_name,sourceSha256:createHash('sha256').update(html).digest('hex'),browserErrors:errors,gameplaySnapshots:snapshots,createdAt:new Date().toISOString()};
 await writeFile(resolve(out,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest));
}finally{await browser.close();server.close()}
