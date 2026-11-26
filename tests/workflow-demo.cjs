// Run with npm run test:workflow. No browser, DB, or network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'szengine-workflow-'));
try {
 for(const name of ['workflowTypes','workflowSeed','workflowDemo']) {
   const source=fs.readFileSync(path.join(__dirname,'../src/lib',name+'.ts'),'utf8');
   fs.writeFileSync(path.join(out,name+'.js'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);
 }
 const {DemoWorkflow}=require(path.join(out,'workflowDemo.js'));
 const w=new DemoWorkflow();
 const admin={id:'a',username:'dominik',role:'admin',is_active:true}, op={id:'o',username:'operator',role:'operator',is_active:true}, viewer={id:'v',username:'viewer',role:'viewer',is_active:true};
 const users=[admin,op,viewer]; let state='idle'; let n=0;
 const setup={motor:'GEN1',intake:'NGT',exhaust:'NGT',muffler:'RC-1 dob',cam:'Roulett',responsible_id:op.id,map:'MAP_01',purpose:'Teszt',attendees:'dominik, operator',initial_hours:0};
 const action=(a,data={},actor=op,id=w.active()?.id??null)=>w.action(actor,users,state,s=>state=s,a,id,data);
 const check=(name,fn)=>{fn();console.log('PASS '+name);n++;};
 check('52 pre-start / 7 shutdown points',()=>assert.deepEqual(w.templates.map(t=>t.items.length),[52,7]));
 check('viewer cannot open',()=>assert.throws(()=>action('create',{setup},viewer)));
 check('invalid setup rejected',()=>assert.throws(()=>action('create',{setup:{...setup,motor:'wrong'}})));
 check('non-idle bench cannot open',()=>{state='maintenance';assert.throws(()=>action('create',{setup}));state='idle';});
 check('create one paired record',()=>{action('create',{setup});assert.equal(w.active().stage,'preparing');assert.equal(w.active().setup.responsible_name,'operator');assert.equal(w.active().pre_items.length,52);assert.equal(w.active().post_items.length,7);});
 const first=w.active(); const oldTitle=first.pre_items[0].title;
 check('duplicate active run blocked',()=>assert.throws(()=>action('create',{setup})));
 check('start and ready blocked before full pre-check',()=>{assert.throws(()=>action('start'));assert.throws(()=>action('ready'));});
 check('shutdown items unavailable before stop',()=>assert.throws(()=>action('tick',{point_id:first.post_items[0].id,checked:true})));
 check('operator cannot edit templates',()=>assert.throws(()=>w.saveTemplate(op,'pre_start',1,w.templates[0].items)));
 check('admin edits snapshot-independent template',()=>{const items=w.templates[0].items.map((i,n)=>n===0?{...i,title:'Új tesztpont'}:i);w.saveTemplate(admin,'pre_start',1,items);assert.equal(w.templates[0].revision,2);assert.equal(first.pre_items[0].title,oldTitle);assert.throws(()=>w.saveTemplate(admin,'pre_start',1,items));});
 check('N/A is not a check and records actor/time',()=>{action('skip',{point_id:first.pre_items[0].id,skipped:true});const p=first.pre_items[0];assert.equal(p.checked_at,null);assert.equal(p.skipped_by,'o');assert(p.skipped_at);assert.throws(()=>action('ready'));});
 check('N/A can be revoked, and check clears skip metadata',()=>{const p=first.pre_items[0];action('skip',{point_id:p.id,skipped:false});assert.equal(p.skipped_at,null);action('skip',{point_id:p.id,skipped:true});action('tick',{point_id:p.id,checked:true});assert.equal(p.skipped_at,null);assert(p.checked_at);action('skip',{point_id:p.id,skipped:true});assert.equal(p.checked_at,null);assert.equal(p.checked_by,null);});
 check('viewer cannot skip, invalid skip flag rejected',()=>{assert.throws(()=>action('skip',{point_id:first.pre_items[1].id,skipped:true},viewer));assert.throws(()=>action('skip',{point_id:first.pre_items[1].id,skipped:'yes'}));});
 check('pre-check accepts explicit N/A plus checked points',()=>{for(const i of first.pre_items.slice(1))action('tick',{point_id:i.id,checked:true});assert(first.pre_items.slice(1).every(i=>i.checked_by==='o'&&i.checked_at));assert(first.pre_items[0].skipped_at&&!first.pre_items[0].checked_at);action('ready');assert.equal(first.stage,'ready');});
 check('completed pre-check cannot be changed',()=>assert.throws(()=>action('tick',{point_id:first.pre_items[0].id,checked:false})));
 check('start only after ready',()=>{action('start');assert.equal(state,'running');assert.equal(first.stage,'running');assert(first.started_at);});
 check('cannot close or cancel running run',()=>{assert.throws(()=>action('close'));assert.throws(()=>action('cancel'));});
 check('stop updates physical state record, opens post checklist',()=>{action('stop');assert.equal(state,'idle');assert.equal(first.stage,'shutdown');assert(first.stopped_at);});
 check('next run and closure blocked until shutdown complete',()=>{assert.throws(()=>action('create',{setup}));assert.throws(()=>action('close'));});
 check('close with checked and N/A shutdown points',()=>{for(const i of first.post_items.slice(0,-1))action('tick',{point_id:i.id,checked:true},admin);action('skip',{point_id:first.post_items.at(-1).id,skipped:true},admin);action('close');assert.equal(first.stage,'completed');assert(first.closed_at);assert.equal(w.active(),undefined);});
 check('second run uses revised template; history unchanged',()=>{action('create',{setup});assert.equal(w.active().number,2);assert.equal(w.active().pre_items[0].title,'Új tesztpont');assert.equal(first.pre_items[0].title,oldTitle);assert.equal(first.post_items[0].checked_by,'a');});
 check('cancel preserves separate history',()=>{action('cancel');assert.equal(w.runs[0].stage,'cancelled');assert.equal(w.runs[1].stage,'completed');});
 check('fault stop records flag and still requires shutdown checklist',()=>{action('create',{setup});const r=w.active();for(const i of r.pre_items)action('tick',{point_id:i.id,checked:true});action('ready');action('start');action('stop',{fault:true});assert.equal(state,'fault');assert.equal(r.stage,'shutdown');assert(r.stop_fault);assert.throws(()=>action('close'));assert.throws(()=>action('create',{setup}));});
 check('archived N/A survives later runs',()=>{assert(first.pre_items[0].skipped_at);assert.equal(first.pre_items[0].checked_at,null);assert.equal(first.post_items.at(-1).skipped_by,'a');});
 console.log(`${n} tests passed`);
} finally {fs.rmSync(out,{recursive:true,force:true});}
