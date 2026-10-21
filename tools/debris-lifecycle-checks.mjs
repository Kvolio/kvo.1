import assert from 'node:assert/strict';
import { Renderer } from '../src/render/renderer.js';
import { Recorder } from '../src/core/recorder.js';
import { FragmentSystem } from '../src/sim/fragments.js';
import { World } from '../src/sim/world.js';

const appearance = {materialColor:'#708090', damage:1, detached:true, plastic:0.2, temp:320, stress:0, nodeSize:0.01};
function renderer() {
  const lines = [], squares = [];
  const ctx = {beginPath(){},moveTo(){},lineTo(...p){lines.push(p);},stroke(){},fillRect(...p){squares.push({p,color:this.fillStyle});}};
  const r = Object.assign(Object.create(Renderer.prototype), {
    ctx, cam:{scale:1000,w:1000,h:1000,toScreen:(x,y)=>[500+x*1000,500-y*1000]},
    dpr:1, lastPathGL:false, matColorCache:new Map(),
    opts:{showTrails:true,field:'material',nodeGain:1,smooth:true,velScale:2000,stressScale:1e9},
  });
  return {r,lines,squares};
}
const frag = (o = {}) => ({x:0,y:0,vx:1000,vy:0,mass:1,size:0.01,kind:'spall',alive:true,motionDistance:0.002,appearance:{...appearance},...o});

{
  const {r,lines,squares} = renderer();
  r.drawFragments({state:'done',fragments:{list:[frag()]}},null);
  assert.equal(lines.length,0,'a finished frame invented a moving streak');
  assert.equal(squares.length,1,'actual debris disappeared from the final frame');
}
{
  const {r,lines} = renderer();
  r.drawFragments({state:'debris',fragments:{list:[frag({motionDistance:0})]}},null);
  assert.equal(lines.length,0,'a newly promoted particle invented a past trajectory');
}
{
  const {r,lines} = renderer();
  r.drawFragments({state:'debris',fragments:{list:[frag()]}},null);
  assert.equal(lines.length,1);
  assert(Math.abs(lines[0][0]-500) <= 2.001,'streak extended beyond the recorded movement');
}
{
  const {r,squares} = renderer();
  const source = {damage:[1],flags:[8],matIndex:[0],matTable:[{mat:{color:appearance.materialColor}}]};
  const expected = r.nodeColor(source,0,null).map(Math.round);
  r.drawFragments({state:'debris',fragments:{list:[frag({motionDistance:0})]}},null);
  assert.equal(squares[0].color,`rgb(${expected.join(',')})`,'existing material changed to orange during handoff');
  assert.equal(squares[0].p[2],14.2,'handoff changed the source node size');
}
{
  const f = frag();
  const world = {domain:null,state:'debris',simTime:1,fragments:{list:[f]},projectile:null,snapshotDiagnostics:()=>({}),log:{entries:[]}};
  const rec = new Recorder(), frame = rec.capture(world);
  f.appearance.damage = 0;
  assert.equal(frame.frags[0][8].damage,1,'recorded appearance still referenced live mutable state');
  const {r,lines} = renderer();
  r.drawFragments({...world,state:'done'},frame);
  assert.equal(lines.length,1,'replaying an earlier moving frame used the current finished state');
}
{
  const fs = new FragmentSystem(null,{add(){}});
  const w = Object.assign(Object.create(World.prototype), {
    domain:{n:1,dx:0.01,px:[0],alive:[1],vx:[1000],vy:[0]},
    solver:{dt:1e-4,step(){w.domain.px[0]+=0.01;},maxContactForce:0,brokenThisStep:0,kineticOf:()=>0},
    fragments:fs,scene:{activeLayers:()=>[],modules:[],bounds:()=>({x0:-1,y0:-1,x1:1,y1:1})},
    simTime:0,paused:true,perf:{},settings:{},stats:{armourDefeated:0},projectile:{speed:1000},state:'impact',contactSeen:false,impactStartTime:0,
    maybeCoast:()=>0,checkFuze(){},stepEra(){},checkModuleStrikes(){},updateStats(){},
    promoteEscapees(){fs.add({x:this.domain.px[0],vx:1000,vy:0,mass:1,dia:0.01});},
  });
  w.impactPhase(1e-4,1);
  assert.equal(fs.list[0].x,w.domain.px[0],'a new handoff particle was advanced over time already simulated');
}
{
  const fs = new FragmentSystem(null,{add(){}});
  const d = {
    n:1,width:2,length:1,dx:0.01,ox:0,oy:0,ax:1,ay:0,bx:0,by:1,
    alive:[1],flags:[8],px:[1.2],py:[0],vx:[1000],vy:[0],mass:[1],role:[0],matIndex:[0],
    damage:[1],plStrain:[0.6],temp:[320],virial:[0],
    matTable:[{mat:{key:'test',class:'synthetic',color:appearance.materialColor},pd:{epsF:1}}],
  };
  const w = Object.assign(Object.create(World.prototype), {
    domain:d,fragments:fs,scene:{activeLayers:()=>[]},simTime:1,stats:{},
    log:{add(){}},bus:{emit(){}},updateStats(){},verdict:()=>({headline:'test complete'}),
  });
  w.promoteEscapees(true);
  assert.equal(d.alive[0]+fs.count,1,'handoff duplicated or discarded a visible particle');
  assert.equal(fs.list[0].appearance.materialColor,appearance.materialColor);
  assert.equal(fs.list[0].appearance.damage,1);
  assert(Object.isFrozen(fs.list[0].appearance),'appearance snapshots should share immutable metadata');
  const state = structuredClone(fs.list);
  w.finish('settled');
  assert.deepEqual(fs.list,state,'finish created or moved fragments');
}

console.log('debris handoff, finish-frame, streak and replay checks passed');
