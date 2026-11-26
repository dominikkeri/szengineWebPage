import { DemoWorkflow, type RunAction, type ActionData } from './workflowDemo';
import type { Run, WorkflowTemplate, DirectoryMember, TemplatePoint } from './workflowTypes';
import { demoMode, supabase } from './supabase';
import type { BenchState, BenchStatus, ChecklistKind, Issue, Profile, Role, Snapshot, StatusEvent } from './types';

const now = () => new Date().toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random()}`;
const profiles: Profile[] = [
  { id: 'demo-admin', username: 'dominik', email: 'dominik@demo.local', role: 'admin', is_active: true, created_at: hoursAgo(600) },
  { id: 'demo-operator', username: 'operator', email: 'operator@demo.local', role: 'operator', is_active: true, created_at: hoursAgo(500) },
  { id: 'demo-viewer', username: 'megfigyelo', email: 'viewer@demo.local', role: 'viewer', is_active: true, created_at: hoursAgo(200) },
];
let demoUser: Profile | null = null;
let demoPasswords: Record<string, string> = { dominik: 'Demo12345!', operator: 'Demo12345!', megfigyelo: 'Demo12345!' };
const workflow = new DemoWorkflow();
let demo: Snapshot = {
  state: { id: 1, status: 'idle', note: 'A fékpad készen áll a következő mérés előkészítésére.', last_run_at: hoursAgo(3.47), updated_at: hoursAgo(3.47), updated_by: 'demo-operator' },
  issues: [
    { id: 'issue-1', title: 'Turbófordulatszám-jel ingadozása', description: 'A szenzorjel ellenőrzése a következő mérés előtt szükséges.', priority: 'high', status: 'in_progress', estimated_fix_at: new Date(Date.now() + 86400000).toISOString(), created_by: 'demo-operator', created_at: hoursAgo(22), updated_at: hoursAgo(8) },
    { id: 'issue-2', title: 'Hűtőfolyadék-hőmérséklet csatorna', description: 'A jeladó csatlakozásának ellenőrzése.', priority: 'medium', status: 'active', estimated_fix_at: null, created_by: 'demo-admin', created_at: hoursAgo(7), updated_at: hoursAgo(7) },
    { id: 'issue-3', title: 'Fékpadi fordulatszám-jel ellenőrzése', description: 'Kábel rögzítve, jel ellenőrizve.', priority: 'low', status: 'done', estimated_fix_at: null, created_by: 'demo-operator', created_at: hoursAgo(96), updated_at: hoursAgo(55) },
  ],
  events: [
    { id: 'event-1', from_status: 'running', to_status: 'idle', note: 'Mérés befejezve.', changed_at: hoursAgo(3.47), changed_by: 'demo-operator' },
    { id: 'event-2', from_status: 'idle', to_status: 'running', note: 'Fordulatszám-lépcsős mérés.', changed_at: hoursAgo(4.1), changed_by: 'demo-operator' },
  ],
  members: profiles, workflowRuns: workflow.runs, workflowTemplates: workflow.templates, directory: [],
};
const changeListeners = new Set<() => void>();
const emit = () => changeListeners.forEach(fn => fn());
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const err = (error: unknown): never => { throw error instanceof Error ? error : new Error(String(error)); };

function demoStatus(status:BenchStatus,note:string,profile:Profile) {
      const old = demo.state.status;
      if (old !== status) {
        demo.events.unshift({ id: id(), from_status: old, to_status: status, note, changed_at: now(), changed_by: profile.id });
      }
      demo.state = { ...demo.state, status, note, updated_at: now(), updated_by: profile.id,
        last_run_at: old === 'running' && status !== 'running' ? now() : demo.state.last_run_at };
}
export const backend = {
  demoMode,
  async currentUser(): Promise<Profile | null> {
    if (demoMode) return demoUser ? copy(demoUser) : null;
    const { data: { user }, error } = await supabase!.auth.getUser();
    if (error || !user) return null;
    const { data: profile, error: profileError } = await supabase!.from('profiles').select('*').eq('id', user.id).single();
    if (profileError || !profile?.is_active) return null;
    return profile as Profile;
  },
  async login(username: string, password: string): Promise<Profile> {
    if (demoMode) {
      const p = profiles.find(x => x.username === username.trim().toLowerCase() && x.is_active);
      if (!p || demoPasswords[p.username] !== password) return err('Hibás felhasználónév vagy jelszó.');
      demoUser = p;
      return copy(p);
    }
    const { data, error } = await supabase!.functions.invoke('username-login', { body: { username: username.toLowerCase().trim(), password } });
    if (error || !data?.access_token || !data?.refresh_token) {
      return err(data?.error ?? (error?.message || 'Sikertelen bejelentkezés. Ellenőrizd az Edge Function telepítését.'));
    }
    const { error: sessionError } = await supabase!.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (sessionError) return err(sessionError);
    const p = await this.currentUser();
    if (!p) return err('Nem sikerült betölteni a felhasználó adatait.');
    return p;
  },
  async logout() {
    if (demoMode) { demoUser = null; return; }
    const { error } = await supabase!.auth.signOut();
    if (error) err(error);
  },
  async load(profile: Profile): Promise<Snapshot> {
    if (demoMode) return copy({ ...demo, workflowRuns: workflow.runs, workflowTemplates: workflow.templates, directory: profiles.filter(x=>x.is_active).map(x=>({id:x.id,username:x.username})), members: profile.role === 'admin' ? profiles : [] });
    const q = [
      supabase!.from('bench_state').select('*').eq('id', 1).single(),
      supabase!.from('issues').select('*').order('created_at', { ascending: false }),
      supabase!.from('status_events').select('*').order('changed_at', { ascending: false }).limit(10),
      profile.role === 'admin' ? supabase!.from('profiles').select('*').order('created_at') : Promise.resolve({ data: [], error: null }),
    ] as const;
    const [state, issues, events, members] = await Promise.all(q);
    const [wt, dir] = await Promise.all([supabase!.from('workflow_templates').select('*'),supabase!.rpc('workflow_member_directory')]);
    if(wt.error) err(wt.error.message); if(dir.error) err(dir.error.message);
    const workflowRuns:Run[]=[];
    for(let offset=0;;offset+=100){ const page=await supabase!.from('workflow_runs').select('*').order('number',{ascending:false}).range(offset,offset+99); if(page.error) err(page.error.message); const rows=page.data as Run[]; workflowRuns.push(...rows); if(rows.length<100)break; }
    for (const result of [state, issues, events, members]) if (result.error) err(result.error.message);
    return {
      state: state.data as BenchState, issues: issues.data as Issue[],
      events: events.data as StatusEvent[], members: members.data as Profile[],
      workflowRuns, workflowTemplates: wt.data as WorkflowTemplate[], directory: dir.data as DirectoryMember[],
    };
  },
  subscribe(listener: () => void): () => void {
    if (demoMode) { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; }
    const channel = supabase!.channel(`testbench-live-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bench_state' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_templates' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_events' }, listener)
      .subscribe();
    return () => { void supabase!.removeChannel(channel); };
  },
  async setStatus(status: BenchStatus, note: string, profile: Profile) {
    if (demoMode) {
      if (!demoUser || !demoUser.is_active || demoUser.role === 'viewer' || workflow.active() || status === 'running') return err('Járatás közben a Checklist oldalon módosítsd az állapotot.');
      demoStatus(status,note,profile);
      emit(); return;
    }
    const { error } = await supabase!.rpc('set_bench_status', { new_status: status, new_note: note });
    if (error) err(error.message);
  },
  async addIssue(input: Pick<Issue, 'title' | 'description' | 'priority' | 'estimated_fix_at' | 'workflow_run_id'>, profile: Profile) {
    if (demoMode) {
      if (!demoUser || !demoUser.is_active || demoUser.role === 'viewer' || demoUser.id !== profile.id) return err('Nincs operátori jogosultság.');
      if (input.workflow_run_id && !workflow.runs.some(r=>r.id===input.workflow_run_id && r.stop_fault)) return err('A hiba miatti leállítás nem található.');
      demo.issues.unshift({ id: id(), ...input, status: 'active', created_by: profile.id, created_at: now(), updated_at: now() });
      emit(); return;
    }
    const { error } = await supabase!.from('issues').insert(input);
    if (error) err(error.message);
  },
  async updateIssue(issueId: string, patch: Partial<Pick<Issue, 'status' | 'estimated_fix_at'>>) {
    if (demoMode) {
      demo.issues = demo.issues.map(x => x.id === issueId ? { ...x, ...patch, updated_at: now() } : x);
      emit(); return;
    }
    const { error } = await supabase!.from('issues').update(patch).eq('id', issueId);
    if (error) err(error.message);
  },
  async runAction(action:RunAction, runId:string|null, data:ActionData={}) {
    if(demoMode) { if(!demoUser) return err('Nincs belépés.'); workflow.action(demoUser,profiles,demo.state.status,(s,n)=>demoStatus(s,n,demoUser!),action,runId,data); emit(); return; }
    const {error}=await supabase!.rpc('workflow_action',{p_action:action,p_run_id:runId,p_data:data}); if(error) err(error.message);
  },
  async saveWorkflowTemplate(kind:ChecklistKind,revision:number,items:TemplatePoint[]) {
    if(demoMode) { if(!demoUser) return err('Nincs belépés.'); workflow.saveTemplate(demoUser,kind,revision,items);emit();return; }
    const {error}=await supabase!.rpc('workflow_save_template',{p_kind:kind,p_revision:revision,p_items:items});if(error)err(error.message);
  },
  async createMember(input: { username: string; email: string; password: string; role: Role }) {
    if (demoMode) {
      if (profiles.some(x => x.username === input.username)) return err('Ez a felhasználónév már létezik.');
      const p: Profile = { id: id(), username: input.username, email: input.email, role: input.role, is_active: true, created_at: now() };
      profiles.push(p); demoPasswords = { ...demoPasswords, [input.username]: input.password }; emit(); return;
    }
    const { data, error } = await supabase!.functions.invoke('admin-create-user', { body: input });
    if (error || data?.error) err(data?.error ?? error!.message);
  },
  async editMember(userId: string, patch: Partial<Pick<Profile, 'role' | 'is_active'>>) {
    if (demoMode) {
      const p = profiles.find(x => x.id === userId);
      if (p) Object.assign(p, patch);
      emit(); return;
    }
    const { error } = await supabase!.from('profiles').update(patch).eq('id', userId);
    if (error) err(error.message);
  },
};

export type Backend = typeof backend;
