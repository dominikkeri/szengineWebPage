import type { BenchStatus, ChecklistKind, Profile } from './types';
import { workflowSeed } from './workflowSeed';
import { allResolved, isOpen, validateSetup, validateTemplate, type Run, type Setup, type TemplatePoint, type WorkflowTemplate } from './workflowTypes';
const copy = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random()}`;
export type RunAction = 'create'|'setup'|'tick'|'skip'|'ready'|'start'|'stop'|'close'|'cancel';
export type ActionData = { setup?: Setup; point_id?: string; checked?: boolean; skipped?: boolean; fault?: boolean };
export class DemoWorkflow {
  templates: WorkflowTemplate[] = copy(workflowSeed);
  runs: Run[] = [];
  active() { return this.runs.find(isOpen); }
  saveTemplate(actor:Profile, kind:ChecklistKind, revision:number, items:TemplatePoint[]) {
    if (!actor.is_active || actor.role !== 'admin') throw Error('Nincs admin jogosultság.');
    const t=this.templates.find(x=>x.kind===kind)!;
    if(t.revision!==revision) throw Error('A sablon időközben változott. Töltsd újra.');
    t.items=validateTemplate(items); t.revision++;
  }
  action(actor:Profile, members:Profile[], status:BenchStatus, setStatus:(s:BenchStatus,n:string)=>void, action:RunAction, runId:string|null, data:ActionData={}) {
    if (!actor.is_active || actor.role==='viewer') throw Error('Nincs operátori jogosultság.');
    const directory=members.filter(p=>p.is_active);
    const active=this.active(); const stamp=now();
    if(action==='create') {
      if(active || status!=='idle') throw Error('Új járatás csak leállított, szabad fékpadon nyitható.');
      const setup=validateSetup(data.setup!,directory);
      const pre=this.templates.find(t=>t.kind==='pre_start')!, post=this.templates.find(t=>t.kind==='shutdown')!;
      const snapshot=(t:WorkflowTemplate)=>t.items.map(i=>({...i,checked_at:null,checked_by:null,checked_name:null,skipped_at:null,skipped_by:null,skipped_name:null}));
      const r:Run={id:id(),number:(this.runs[0]?.number??0)+1,stage:'preparing',setup,created_at:stamp,created_by:actor.id,created_name:actor.username,pre_revision:pre.revision,post_revision:post.revision,pre_items:snapshot(pre),post_items:snapshot(post),pre_completed_at:null,pre_completed_name:null,started_at:null,started_name:null,stopped_at:null,stopped_name:null,closed_at:null,closed_name:null,stop_fault:false};
      this.runs.unshift(r); return;
    }
    if(!active || active.id!==runId) throw Error('A járatás már nem aktív.');
    const r=active;
    switch(action) {
      case 'setup': if(r.stage!=='preparing') throw Error('A setup már nem szerkeszthető.'); r.setup=validateSetup(data.setup!,directory); break;
      case 'tick': {
        const list=r.stage==='preparing'?r.pre_items:r.stage==='shutdown'?r.post_items:null;
        const point=list?.find(i=>i.id===data.point_id);
        if(!point || typeof data.checked!=='boolean') throw Error('Ez a pont nem szerkeszthető.');
        Object.assign(point,{checked_at:data.checked?stamp:null,checked_by:data.checked?actor.id:null,checked_name:data.checked?actor.username:null,skipped_at:null,skipped_by:null,skipped_name:null}); break;
      }
      case 'skip': {
        const list=r.stage==='preparing'?r.pre_items:r.stage==='shutdown'?r.post_items:null;
        const point=list?.find(i=>i.id===data.point_id);
        if(!point || typeof data.skipped!=='boolean') throw Error('Ez a pont nem szerkeszthető.');
        Object.assign(point,{checked_at:null,checked_by:null,checked_name:null,skipped_at:data.skipped?stamp:null,skipped_by:data.skipped?actor.id:null,skipped_name:data.skipped?actor.username:null}); break;
      }
      case 'ready': if(r.stage!=='preparing'||!allResolved(r.pre_items)||status!=='idle') throw Error('Minden indítás előtti pontról nyilatkozni kell.'); r.setup=validateSetup(r.setup,directory); r.stage='ready';r.pre_completed_at=stamp;r.pre_completed_name=actor.username;break;
      case 'start': if(r.stage!=='ready'||status!=='idle'||!allResolved(r.pre_items)) throw Error('Az indítás előtti ellenőrzés nincs lezárva.'); r.setup=validateSetup(r.setup,directory); setStatus('running',`Járatás #${r.number} – ${r.setup.purpose}`.slice(0,500));r.stage='running';r.started_at=stamp;r.started_name=actor.username;break;
      case 'stop': if(r.stage!=='running') throw Error('Nincs folyamatban járatás.'); setStatus(data.fault?'fault':'idle',`Járatás #${r.number} leállítva – checklist szükséges`); r.stage='shutdown';r.stopped_at=stamp;r.stopped_name=actor.username;r.stop_fault=!!data.fault;break;
      case 'close': if(r.stage!=='shutdown'||!allResolved(r.post_items)) throw Error('Minden leállítási pontról nyilatkozni kell.'); r.stage='completed';r.closed_at=stamp;r.closed_name=actor.username;break;
      case 'cancel': if(r.stage!=='preparing'&&r.stage!=='ready') throw Error('Csak az előkészítés szakítható meg.'); r.stage='cancelled';r.closed_at=stamp;r.closed_name=actor.username;break;
    }
  }
}
