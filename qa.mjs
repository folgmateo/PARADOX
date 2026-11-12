// Run with Node 22+ and a local Chromium browser. This file is not loaded by the game.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const html = await readFile(new URL('./index.html', import.meta.url));
const evidence = new URL('./evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const requests = [];
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url !== '/') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length,
    'Cache-Control': 'no-store' }).end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/';
const profile = await mkdtemp(join(tmpdir(), 'paradox-qa-'));
const browser = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const child = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--disable-background-networking',
  '--disable-gpu', '--in-process-gpu',
  ...process.argv.slice(3),
  '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, 'about:blank'],
  { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
child.on('error', error => console.error(error));
let browserLog='';
child.stderr.on('data',data=>{browserLog=(browserLog+data).slice(-4500)});
let ws;
try {
  let port;
  for (let i=0; i<100&&!port; i++) {
    try { port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; }
    catch { await sleep(100); }
  }
  assert(port, 'Chromium debugging port');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)})).json();
  ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject}),
    sleep(5000).then(()=>{throw Error('Chromium WebSocket connection timeout')})
  ]);
  const pending=new Map(), errors=[], network=[];
  let id=0;
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id){
      const waiter=pending.get(message.id);
      if(!waiter)return;
      pending.delete(message.id);
      if(message.error)waiter.reject(Error(message.error.message));else waiter.resolve(message.result);
    }
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text);
    if(message.method==='Network.requestWillBeSent'&&message.params.request.url.startsWith('http'))network.push(message.params.request.url);
  };
  function send(method,params={}){
    const serial=++id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(serial);reject(Error('Chromium timeout: '+method))},16000);
      pending.set(serial,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
      ws.send(JSON.stringify({id:serial,method,params}));
    });
  }
  async function js(expression){
    const reply=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);
    return reply.result.value;
  }
  async function until(expression){
    for(let i=0;i<240;i++){if(await js(expression))return;await sleep(50)}
    throw Error('Timed out: '+expression);
  }
  async function screenshot(name){
    const {data}=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(new URL(name,evidence),Buffer.from(data,'base64'));
  }
  const key=(type,key,code=key)=>send('Input.dispatchKeyEvent',{
    type,key,code,windowsVirtualKeyCode:{Enter:13,Escape:27,w:87}[key]
  });
  await Promise.all(['Page','Runtime','Log','Network'].map(domain=>send(domain+'.enable')));
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  await until('document.readyState==="complete" && typeof run!=="undefined"');
  const timing=await js(`(()=>{
    const n=performance.getEntriesByType('navigation')[0];
    return {decoded:n.decodedBodySize,encoded:n.encodedBodySize,transfer:n.transferSize,
      assets:performance.getEntriesByType('resource').map(r=>r.name)};
  })()`);
  assert.equal(timing.decoded,html.length);
  assert.equal(timing.encoded,html.length);
  assert(html.length<=32768);
  assert.deepEqual(timing.assets,[]);
  assert.deepEqual(network,[url]);
  assert.deepEqual(requests,['/']);
  await screenshot('01-title.png');

  // Play through the regular entry points in the clean browser, then remove network access.
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await key('keyDown','Enter');await key('keyUp','Enter');
  await until('state==="PLAYING" && audio?.state==="running"');
  await key('keyDown','w','KeyW');
  await until('run.shardsTaken>=1');
  await key('keyUp','w','KeyW');
  await key('keyDown','Escape');await key('keyUp','Escape');
  await until('state==="PAUSED"');
  const paused=await js('run.tick');await sleep(180);
  assert.equal(await js('run.tick'),paused);
  await key('keyDown','Enter');await key('keyUp','Enter');
  await until('state==="PLAYING" && run.tick>'+paused);
  await js('$("sound").click();prefs.mute');
  assert.equal(await js('prefs.mute && $("sound").getAttribute("aria-pressed")==="true"'),true);
  await js('$("volume").value=23;$("volume").dispatchEvent(new Event("input"));');
  assert.equal(await js('read(audioKey,{}).volume'),23);
  await js('$("sound").click();');
  await until('run.echoes.length===1');
  await screenshot('02-echo.png');

  const frameTimes=await js(`new Promise(resolve=>{
    let previous=0;const samples=[];
    function take(now){
      if(previous)samples.push(now-previous);previous=now;
      if(samples.length<140)requestAnimationFrame(take);else resolve(samples);
    }
    requestAnimationFrame(take);
  })`);
  frameTimes.sort((a,b)=>a-b);
  const median=frameTimes[70],p95=frameTimes[132];

  await send('Emulation.setDeviceMetricsOverride',{width:390,height:760,deviceScaleFactor:2,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await js('begin(3200)');
  const origin=await js(`(()=>{const b=canvas.getBoundingClientRect();return {x:b.left+b.width*.4,y:b.top+b.height*.55}})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+50,y:origin.y}]});
  await until('run.player.x>550');
  await screenshot('03-touch.png');
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await js('pointer===null && document.documentElement.scrollWidth===innerWidth'),true);
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});

  const checks=await js(`(()=>{
    const passed=[];
    function check(name,value){if(!value)throw Error(name);passed.push(name)}
    prefs.mute=true;
    begin(25);keys.add('a');for(let i=0;i<LOOP;i++)step();
    const first=run.path.slice();keys.clear();keys.add('s');step();
    check('First echo and exact positional recording',run.lap===1&&run.echoes[0].path.every((v,i)=>v===first[i])&&first[0]<480);
    check('Dynamic gate collides with live player',blocked(barX(215),215));
    run.frame=130;
    const echo=run.echoes[0], px=padSpots[0][0],py=padSpots[0][1];
    echo.path[260]=px;echo.path[261]=py;
    Object.assign(run.player,{x:805,y:310,vx:0,vy:0});const points=run.score;interactions();
    check('Live and echo relay opens gates and scores',run.relays===1&&run.open>0&&run.score>points&&!blocked(barX(215),215));
    const second=first.slice();second[260]=805;second[261]=310;
    run.echoes.push({path:second,id:1,close:false});run.hull=2;
    Object.assign(run.player,{x:480,y:300});interactions();
    check('Two echoes charge core and collect combo repair',run.links===1&&run.relays===2&&run.hull===3&&run.combo>=2);
    run.lap=2;run.sweep=buildSweep();run.frame=run.sweep.at+60;
    const sweep=run.sweep, pos=sweepPosition(sweep);
    Object.assign(run.player,sweep.horizontal?{x:sweep.gap,y:pos}:{x:pos,y:sweep.gap});
    hazard();check('Visible sweep gap is safe',run.hull===3);
    Object.assign(run.player,sweep.horizontal?{x:42,y:pos}:{x:pos,y:42});
    hazard();check('Live sweep causes damage',run.hull===2);
    run.lap=4;check('Shield bay removed in phase five',safe(96,94)&&!safe(864,506));
    run.frame=130;run.shield=0;Object.assign(run.player,{x:px,y:py});
    interactions();check('Solid echo damages player and breaks chain',run.hull===1&&run.combo===0);
    run.shield=0;interactions();
    check('Game over reason, stats and persisted record',state==='GAME_OVER'&&$("intro").textContent.includes('echo')&&read(recordsKey,[]).length>0);
    return passed;
  })()`);
  await js('$("go").click()');
  assert.equal(await js('state==="PLAYING" && run.echoes.length===0 && run.hull===3'),true);
  const runs=await js(`(()=>{
    const styles=['idle','perimeter','collector','relay planner','evasive','erratic'];
    const rows=[];
    for(let n=0;n<24;n++){
      begin(871+n*12991);
      let prng=n*1193+987, waypoint=0;
      const style=n%styles.length, patrol=[[890,85],[890,515],[70,515],[70,85]];
      for(let i=0;i<5400&&state==='PLAYING';i++){
        const p=run.player,s=run.sweep;
        let x=p.x,y=p.y;
        if(style===1){
          if(dist(x,y,...patrol[waypoint])<35**2)waypoint=(waypoint+1)%4;
          [x,y]=patrol[waypoint];
        }else if(style>=2&&style<=4){
          const shard=run.shards.reduce((a,b)=>dist(p.x,p.y,a.x,a.y)<dist(p.x,p.y,b.x,b.y)?a:b);
          ({x,y}=shard);
          if(style===3){
            if(run.charge>0){x=480;y=300}
            else if(run.frame>150&&run.frame<238)[x,y]=padSpots[run.lap%4];
          }
          if(style===4&&s&&run.frame>=s.at-70&&run.frame<=s.at+132){
            if(s.horizontal)x=s.gap;else y=s.gap;
          }
          if(style!==2)for(const e of run.echoes){
            const f=Math.min(run.frame+9,479)*2,ex=e.path[f],ey=e.path[f+1];
            if(dist(p.x,p.y,ex,ey)<57**2){x=p.x+(p.x-ex)*4;y=p.y+(p.y-ey)*4;break}
          }
        }else if(style===5){
          if(i%49===0)prng=(Math.imul(prng,1664525)+1013904223)>>>0;
          x+=Math.cos(prng%127)*90;y+=Math.sin(prng%127)*90;
        }
        keys.clear();
        if(x<p.x-8)keys.add('a');if(x>p.x+8)keys.add('d');
        if(y<p.y-8)keys.add('w');if(y>p.y+8)keys.add('s');
        step();
      }
      rows.push({style:styles[style],seconds:+(run.tick/60).toFixed(2),score:run.score,
        phase:run.lap+1,relays:run.relays,reason:state==='GAME_OVER'?run.lastDamage:'90 s cap'});
    }
    return rows;
  })()`);
  assert.equal(runs.length,24);
  assert(runs.filter(row=>row.style==='idle').every(row=>row.score===0));
  assert(runs.some(row=>row.relays>0));
  await js(`begin(5508);for(let i=0;i<900&&state==='PLAYING';i++)step()`);
  await screenshot('04-results.png');
  assert.deepEqual(errors,[]);
  assert.deepEqual(network,[url]);
  const version=await send('Browser.getVersion');
  const report={browser:version.product,bytes:html.length,http:timing,requests,
    offlineAfterLoad:true,touchEmulation:true,consoleErrors:errors,checks,
    frameSample:{frames:140,medianMs:+median.toFixed(2),p95Ms:+p95.toFixed(2)},
    runs};
  await writeFile(new URL('results.json',evidence),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  console.error(browserLog);
  throw error;
} finally {
  ws?.close();child.kill();server.closeAllConnections();server.close();
  await sleep(650);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
