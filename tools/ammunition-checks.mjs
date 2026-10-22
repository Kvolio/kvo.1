import assert from 'node:assert/strict';
import { PROJECTILE_TYPES, TYPE_ORDER, makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { Projectile } from '../src/sim/projectile.js';
import { World } from '../src/sim/world.js';
import { Recorder } from '../src/core/recorder.js';
import { Renderer, apheSectionDetails } from '../src/render/renderer.js';
import { AMMO, AMMO_ORDER, ammoLabel } from '../src/ui/ammo.js';
import { contactFixture } from './fixtures/contact-scene.js';
import { PDDomain } from '../src/sim/pd/domain.js';
import { PDSolver } from '../src/sim/pd/solver.js';
import { getMaterial } from '../src/materials/database.js';
import { pointInPoly } from '../src/core/math.js';
import { Scene, makeLayer } from '../src/sim/scene.js';

// Software contracts, not reference ammunition performance or calibration.
let checks = 0, failures = 0;
function test(label, fn) {
  try { fn(); checks++; console.log(`  ok ${label}`); }
  catch (error) { failures++; console.error(`  FAIL ${label}: ${error.message}`); }
}

for (const type of TYPE_ORDER) {
  test(`${type}: defaults, configuration, geometry, reset and save/load`, () => {
    const cfg = makeProjectileConfig(type);
    for (const [k, v] of Object.entries(PROJECTILE_TYPES[type].defaults)) assert.deepEqual(cfg[k], v, `${type}.${k} default was overwritten`);
    assert.equal(makeProjectileConfig(type, {aimY:0.123}).aimY, 0.123);
    assert.equal(makeProjectileConfig(type, {type:'invalid'}).type, type);
    const w = new World(); w.setProjectile(cfg);
    const p = w.projectile;
    assert(p.parts.every(q => q.poly.every(Number.isFinite)));
    assert(p.mass > 0 && Number.isFinite(p.mass));
    w.finish('miss'); w.reset();
    assert.equal(w.state, 'idle');
    assert.notEqual(w.verdict().headline, 'No contact', 'previous miss leaked into a fresh run');
    assert.equal(p.fuzeState, p.type.fuze ? 'safe' : 'none');
    assert.equal(p.detonated, false);
    const loaded = new World().loadJSON(w.toJSON());
    assert.deepEqual(loaded.projectileCfg, cfg);
    assert.equal(loaded.projectile.mass, p.mass);
  });
}

function view() {
  const draws = [];
  const ctx = {save(){},restore(){},translate(){},fill(){draws.push(this.fillStyle);},stroke(){}};
  return {draws, r:Object.assign(Object.create(Renderer.prototype), {
    ctx, dpr:1, opts:{extrude:false},
    extrudeVec:()=>[0,0],matColor:c=>c,polyGradient:(_,c)=>c,polyPath(){},
  })};
}
test('APHE cutaway draws filler over casing and never draws an intact shell after impact', () => {
  const p = new Projectile(makeProjectileConfig('aphe'));
  const {r, draws} = view();
  r.drawProjectile({projectile:p,state:'idle'}, null);
  assert(draws.includes(p.parts.find(q=>q.role===3).mat.color));
  draws.length=0; r.drawProjectile({projectile:p,state:'impact'},null);
  assert.equal(draws.length,0);
});
test('APHE section model fits scaled shell geometry without changing simulation parts', () => {
  for (const mass of [2,10.2,30]) {
    const p=new Projectile(makeProjectileConfig('aphe',{mass}));
    const before=JSON.stringify(p.parts), details=apheSectionDetails(p);
    for (const name of ['driving band','base plug','base fuze housing','booster','exposed filler']) assert(details.some(q=>q.label===name));
    const body=p.parts.find(q=>q.role===1).poly;
    for (const q of details) for (let i=0;i<q.poly.length;i+=2) {
      assert(Number.isFinite(q.poly[i])&&Number.isFinite(q.poly[i+1]));
      assert(pointInPoly(body,q.poly[i],q.poly[i+1]),`${q.label} escaped the shell silhouette`);
    }
    assert.equal(JSON.stringify(p.parts),before);
    assert.equal(apheSectionDetails(p),details,'static view geometry should be cached');
  }
});
test('APHE pointed nose uses the same detailed outline for flight and meshing', () => {
  const p=new Projectile(makeProjectileConfig('aphe'));
  const cap=p.parts.find(q=>q.role===2), R=p.cfg.caliber/2;
  assert(cap.poly.length>100,'nose still has coarse facets');
  const tip=[];
  for(let i=0;i<cap.poly.length;i+=2) if(Math.abs(cap.poly[i])<1e-12) tip.push(Math.abs(cap.poly[i+1]));
  assert(tip.length===2&&tip.every(r=>r<R*.01),'nose reverted to a blunt meplat');
  assert(p.meshParts().includes(cap));
});

// Optional focused rerun after a change limited to the APHE geometry. The full
// checks.mjs suite also exercises these catalog entries against 100 mm RHA.
if(process.argv.includes('--aphe-runs')) {
  const cases=[['default APHE',makeProjectileConfig('aphe',{standoff:.6}),.05],
    ...AMMO_ORDER.filter(k=>AMMO[k].type==='aphe').map(k=>[k,makeProjectileConfig('aphe',AMMO[k].cfg),.10])];
  for(const [label,cfg,thickness] of cases) test(`${label}: revised model meshes and completes`,()=>{
    const w=new World(); w.settings.deterministic=true; w.settings.quality='low';w.settings.recordFrames=false;
    const scene=new Scene();scene.setLayers([makeLayer({material:'rha',thickness})]);
    w.setScene(scene);w.setProjectile(cfg);w.fire();
    let frames=0;while(w.state!=='done'&&frames++<9000) w.update(1/60);
    assert.equal(w.state,'done');assert(w.domain?.n>200);
    assert(Number.isFinite(w.stats.maxDepth)&&Number.isFinite(w.stats.residualVelocity));
  });
}
for (const type of ['apds','apfsds']) test(`${type}: live and replay sabot visibility agrees`, () => {
  const p = new Projectile(makeProjectileConfig(type)), {r,draws}=view();
  r.drawProjectile({projectile:p,state:'flight'},null);
  assert.equal(draws.length,p.parts.length,'attached sabot vanished from the live view');
  const live = [...draws]; draws.length=0;
  r.drawProjectile({projectile:p,state:'done'},{proj:{x:p.x,y:p.y,ang:p.ang,sabot:true}});
  assert.deepEqual(draws,live);
  p.distance=p.cfg.sabotRange; const before=p.mass;
  const petals=p.tryDiscardSabot();
  assert(petals?.length>0); assert.equal(p.tryDiscardSabot(),null);
  assert(Math.abs(p.mass+petals.reduce((m,q)=>m+q.mass,0)-before)<1e-10);
  draws.length=0; r.drawProjectile({projectile:p,state:'flight'},null);
  assert.equal(draws.length,p.meshParts().length);
});
test('rendering a recorded pose is read-only even when drawing throws', () => {
  const p = new Projectile(makeProjectileConfig('aphe'));
  const before={x:p.x,y:p.y,ang:p.ang};
  const {r}=view(); r.polyPath=()=>{throw Error('synthetic canvas failure');};
  assert.throws(()=>r.drawProjectile({projectile:p,state:'done'},{proj:{x:9,y:8,ang:1,sabot:false}}));
  assert.deepEqual({x:p.x,y:p.y,ang:p.ang},before);
});

for (const type of ['aphe','he','hesh']) test(`${type}: contact-triggered events are single-shot and independent of frame grouping`, () => {
  for (const tick of [0.01,0.025]) {
    const w=new World(); w.setProjectile(makeProjectileConfig(type,{fuzeDelay:0.1}));
    w.state='impact'; let calls=0;
    w.detonateShell=()=>{calls++;w.projectile.detonated=true;w.projectile.fuzeState='functioned';};
    w.simTime=0.2; w.checkFuze();
    assert.equal(w.projectile.fuzeState,'safe','continuum handoff invented contact');
    w.contactSeen=true; w.trueContactTime=0.2;
    for(let i=0;i<20;i++) { w.simTime=0.2+i*tick; w.checkFuze(); }
    assert.equal(calls,1); assert.equal(w.projectile.fuzeTimer,0.2);
    assert.equal(w.log.entries.filter(e=>e.type==='fuze-arm').length,1);
  }
});
test('HEAT imposed formation runs once without a conventional-shell dud', () => {
  const w=new World();w.setProjectile(makeProjectileConfig('heat'));
  let formations=0,bursts=0;
  w.formJet=()=>{formations++;return true;};w.detonateShell=()=>{bursts++;};
  for(let i=0;i<10;i++){w.simTime=i;w.checkFuze();}
  assert.equal(formations,1);assert.equal(bursts,0);
  assert.equal(w.projectile.fuzeState,'functioned');
  assert.equal(w.log.has('fuze-dud'),false);
});
for(const type of ['aphe','he','hesh']) test(`${type}: missing filler reports an unavailable event once`,()=>{
  const w=new World();w.setProjectile(makeProjectileConfig(type,{fuzeDelay:0}));
  w.domain={n:0};w.contactSeen=true;w.trueContactTime=0;
  for(let i=0;i<3;i++) w.checkFuze();
  assert.equal(w.projectile.fuzeState,'dud');assert.equal(w.projectile.detonated,true);
  assert.equal(w.log.entries.filter(e=>e.type==='fuze-dud').length,1);
});
test('HEAT with no available liner does not falsely report successful formation',()=>{
  const w=new World();w.setProjectile(makeProjectileConfig('heat'));w.domain={n:0};
  for(let i=0;i<3;i++) w.checkFuze();
  assert.equal(w.projectile.fuzeState,'dud');assert.equal(w.log.has('jet-formed'),false);
  assert.equal(w.log.entries.filter(e=>e.type==='jet-unavailable').length,1);
});
test('active debris continues after the former 15 ms cutoff, then finishes naturally',()=>{
  const w=new World();w.state='debris';w.simTime=.02;w.debrisStart=0;
  let active=1;
  w.fragments={get liveCount(){return active;},fastest:()=>100,step(){},list:[],impacts:[]};
  w.debrisPhase(.001);assert.equal(w.state,'debris');assert.equal(w.stats.debrisTruncated,false);
  active=0;w.debrisPhase(.001);assert.equal(w.state,'done');assert.equal(w.verdict().incomplete,false);
});
test('explicit debris budget reports an incomplete result without inventing particle changes',()=>{
  const w=new World();w.state='debris';w.simTime=.02;w.debrisStart=0;w.settings.debrisTime=.015;
  const fragments=w.fragments;
  const particle={x:1,y:2,vx:3,vy:4};
  w.fragments={liveCount:1,fastest:()=>100,step(){},list:[particle],impacts:[]};
  const before=structuredClone(particle);w.debrisPhase(.001);
  assert.equal(w.state,'done');assert.equal(w.verdict().incomplete,true);
  assert.deepEqual(particle,before);assert(w.log.has('debris-truncated'));
  assert(w.log.get('debris-truncated').severity>=2,'time-budget warning was silently downgraded');
  w.fragments=fragments;w.reset();assert.equal(w.stats.debrisTruncated,false);
});
test('contact-phase duration stops growing during debris playback and final reporting',()=>{
  const w=new World(),scene=new Scene();scene.setLayers([makeLayer({material:'rha',thickness:.05})]);w.setScene(scene);
  w.domain={n:0,ax:1,ay:0,bx:0,by:1,ox:0,oy:0};w.solver={totalBroken:0};
  w.trueContactTime=1;w.simTime=1.002;w.state='impact';w.updateStats();assert.equal(w.stats.contactTime,0,'meshing ahead of contact started the readout clock');
  w.contactSeen=true;w.updateStats();
  const duration=w.stats.contactTime;assert(Math.abs(duration-.002)<1e-12);
  for(const state of ['debris','done']) {w.state=state;w.simTime=2;w.updateStats();assert.equal(w.stats.contactTime,duration);}
});
test('short contact pulses are latched before later solver steps clear them', () => {
  const w=new World(), {d,s}=contactFixture([8,4]);
  w.domain=d;w.solver=s;w.simTime=1;s.maxContactForce=1;
  w.observeContact();w.simTime=2;s.maxContactForce=0;w.observeContact();
  assert.equal(w.contactSeen,true);assert.equal(w.trueContactTime,1);assert.equal(w.lastActivity,1);
  assert.equal(w.log.entries.filter(e=>e.type==='first-contact').length,1);
});
test('adaptive timestep changes do not change the elapsed interval retroactively', () => {
  const w=new World(), {d,s}=contactFixture([8,4]);
  w.domain=d;w.solver=s;w.paused=true;w.state='impact';w.simTime=0;
  w.maybeCoast=()=>0;w.checkFuze=()=>{};w.stepEra=()=>{};
  w.checkModuleStrikes=()=>{};w.updateStats=()=>{};w.promoteEscapees=()=>{};
  let fragmentDt=0;w.fragments.step=dt=>{fragmentDt=dt;};
  s.dt=0.01;s.step=function(){this.dt=0.002;return 0.01;};
  w.impactPhase(0.01,1);
  assert.equal(w.simTime,0.01);assert.equal(fragmentDt,0.01);
});

for (const type of TYPE_ORDER) test(`${type}: checkpoint restores events, accounting and exact solver continuation`, () => {
  // A tiny synthetic contact fixture keeps this independent of weapon data.
  const w=new World(); w.setProjectile(makeProjectileConfig(type));
  const {d,s}=contactFixture([8,4],[[0,0],[0.6,0]]);
  d.bsp=new Float32Array(0); d.bstate=new Uint8Array(0); d.bcrit=new Float32Array(0);
  w.domain=d; w.solver=s; w.state='impact'; w.simTime=1;
  w.contactSeen=true; w.trueContactTime=0.9; w.impactStartTime=0.8;
  w.lastActivity=0.95; w.progressMark=0.2; w.lastProgressTime=0.96;
  w.impactKE0=s.kinetic(); w.coastDirty=false; w.coastMode=false;
  w.retiredProjM=0.3; w.retiredProjPX=0.4; w.retiredProjPY=0.5;
  w.cassettes=[{initiated:false,columns:[{fired:false}]}]; w.eraLastT=0.99;
  w.projectile.fuzeState=w.projectile.type.fuze?'armed':'none'; w.projectile.fuzeTimer=0.97;
  w.fragments.nextId=8; w.fragments.stoppedInPlate=2;
  w.fragments._loggedLayers.add('synthetic-layer');
  w.log.add(1,'checkpoint','synthetic event');
  for(let i=0;i<4;i++) s.step();
  const savedForces=[...d.fx],savedState=w.projectile.fuzeState;
  const rec=new Recorder(); rec.captureKey(w,0);
  const beforeRestore=s.energyAudit();
  for(let i=0;i<12;i++) s.step();
  const expected={px:[...d.px],vx:[...d.vx],energy:{...s.energy},dt:s.dt};
  w.projectile.detonated=true; w.projectile.fuzeState='functioned';
  w.stats.detonation={future:true}; w.stats.atPerforation={future:true};
  w.cassettes[0].initiated=true; w.cassettes[0].columns[0].fired=true;
  w.internals.catastrophic=true; w.fragments.nextId=100; w.fragments.stoppedInPlate=99;
  w.fragments._loggedLayers.add('future-layer'); d.role[0]=1;
  w.log.add(2,'future','must disappear');
  assert(rec.restoreKey(w,0));
  assert.equal(w.projectile.detonated,false);
  assert.equal(w.projectile.fuzeState,savedState);
  assert.equal(w.stats.detonation,undefined); assert.equal(w.stats.atPerforation,undefined);
  assert.equal(w.cassettes[0].initiated,false); assert.equal(w.cassettes[0].columns[0].fired,false);
  assert.equal(w.internals.catastrophic,false);
  assert.equal(w.fragments.nextId,8); assert.equal(w.fragments.stoppedInPlate,2);
  assert.deepEqual([...w.fragments._loggedLayers],['synthetic-layer']);
  assert.equal(w.log.entries.length,1); assert.equal(w.log.seq,1);
  assert.equal(d.role[0],0); assert.deepEqual([...d.fx],savedForces);
  assert.deepEqual(s.energyAudit(),beforeRestore,'restoring must not perform another force/energy update');
  for(let i=0;i<12;i++) s.step();
  assert.deepEqual({px:[...d.px],vx:[...d.vx],energy:{...s.energy},dt:s.dt},expected);
});

test('catalog preserves existing entries and supplies 12 sourced game representations', () => {
  assert.equal(AMMO_ORDER.length,39);
  const added=Object.values(AMMO).filter(a=>a.approximate);
  assert.equal(added.length,12);
  for(const a of added) {
    assert(a.sources?.length); assert(a.sources.every(s=>/^https:\/\//.test(s.url)&&s.title));
    assert.deepEqual(a.cfg,PROJECTILE_TYPES[a.type].defaults,'historical metadata must not imply newly calibrated values');
  }
  for(const k of AMMO_ORDER) {
    const a=AMMO[k], cfg=makeProjectileConfig(a.type,a.cfg), p=new Projectile(cfg);
    assert(p.mass>0&&Number.isFinite(p.mass)); assert(p.parts.every(q=>q.poly.every(Number.isFinite)));
    assert(ammoLabel(k).includes(a.name)); assert(!ammoLabel(k).includes('undefined'));
    assert.equal(ammoLabel(k).includes('game approximation'),!!a.approximate);
  }
});
test('generic elastic contacts conserve mass/momentum and converge when the timestep is halved', () => {
  const outcomes=[];
  for(const dt of [0.001,0.0005]) {
    const {d,s}=contactFixture([8,8],[[-1.2,0],[1.2,0]]);
    d.vx[0]=1;d.vx[1]=-1;s.E0=s.kinetic();
    for(let i=0;i<Math.round(1.6/dt);i++)s.step(dt);
    assert.equal(d.mass[0]+d.mass[1],2);
    assert(Math.abs(d.mass[0]*d.vx[0]+d.mass[1]*d.vx[1])<1e-6);
    const drift=Math.abs(s.energyAudit().drift);
    assert(drift<0.01,'generic elastic contact exceeded the declared 1% energy tolerance');
    assert(d.vx[0]<0&&d.vx[1]>0);outcomes.push(drift);
  }
  assert(outcomes[1]<outcomes[0],'halving dt did not improve the controlled elastic fixture');
});
test('bonded-domain checkpoint preserves force history and energy without recomputation', () => {
  const d=new PDDomain({dx:0.01,slab:0.01,origin:[0,0],dir:[1,0],length:0.04,width:0.04});
  d.addSolid({poly:Float64Array.from([0,-0.02,0.04,-0.02,0.04,0.02,0,0.02]),material:getMaterial('mild'),bodyId:1,bondGroup:1,role:0});
  d.build();const s=new PDSolver(d,{gravity:0});d.vx[0]=0.01;
  const w=new World();w.domain=d;w.solver=s;w.state='impact';
  for(let i=0;i<8;i++)s.step();
  const rec=new Recorder();rec.captureKey(w,0);
  for(let i=0;i<16;i++)s.step();
  const snapshot=()=>({px:[...d.px],vx:[...d.vx],bsp:[...d.bsp],bdc:[...s.bdc],energy:{...s.energy}});
  const expected=snapshot();assert(d.nb>0);
  assert(rec.restoreKey(w,0));for(let i=0;i<16;i++)s.step();
  assert.deepEqual(snapshot(),expected);
  assert(rec.memoryBytes()>0);
});
console.log(`${checks} ammunition software checks passed; ${failures} failed`);
if (failures) process.exitCode=1;
