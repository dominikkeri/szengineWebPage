import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import szengineMark from './assets/szengine-mark.svg';
import {
  Activity, AlertTriangle, ArrowRight, CalendarClock, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleDot, ClipboardCheck, Clock3, Eye, EyeOff,
  FileWarning, History, LayoutDashboard, ListChecks, LockKeyhole, LogOut,
  Plus, Power, Radio, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserRound,
  UsersRound, Wrench, X,
} from 'lucide-react';
import { Workflow, RunHistory, ChecklistAdmin } from './Workflow';
import { isOpen, stageName, type Run } from './lib/workflowTypes';
import { backend } from './lib/backend';
import type { BenchStatus, Issue, IssueStatus, Priority, Profile, Role, Snapshot } from './lib/types';
import { issueName, priorityName, roleName, statusName } from './lib/types';

type Tab = 'dashboard' | 'issues' | 'checklists' | 'runs' | 'members';
type Navigate = (tab: Tab, options?: { newIssue?: boolean; faultRun?: Run }) => void;
const statuses: BenchStatus[] = ['idle', 'maintenance', 'fault'];
const issueStatuses: IssueStatus[] = ['active', 'in_progress', 'done'];
const statusClass = (s: BenchStatus) => `status-${s}`;
const dateString = (iso: string | null) => iso ? new Date(iso).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
function relativeTime(iso: string | null, tick: number) {
  if (!iso) return 'Még nincs rögzített járatás';
  const seconds = Math.max(0, Math.floor((tick - new Date(iso).getTime()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} nap ${hours} óra ${minutes} perc` : hours ? `${hours} óra ${minutes} perc` : `${minutes} perc ${seconds % 60} mp`;
}
function errorMessage(e: unknown) { return e instanceof Error ? e.message : 'Ismeretlen hiba történt.'; }

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <div className="brand-symbol"><img src={szengineMark} alt="SZEngine logo" /></div>
    <div><div className="brand-word">SZ<span>ENGINE</span></div><div className="brand-sub">TESTBENCH CONTROL</div></div>
  </div>;
}
function Chip({ children, color = 'neutral' }: { children: ReactNode; color?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' }) {
  return <span className={`chip chip-${color}`}>{children}</span>;
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}
function SectionTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return <div className="section-title"><div className="section-title-left">{icon}<h2>{title}</h2></div>{action}</div>;
}

function Login({ onLogin }: { onLogin: (profile: Profile) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try { onLogin(await backend.login(username.trim(), password)); }
    catch (ex) { setError(errorMessage(ex)); }
    finally { setLoading(false); }
  };
  return <main className="login-screen">
    <div className="login-strip" />
    <div className="login-top"><Brand /><span className="login-top-note"><span className="live-dot" /> SZENGINE / INTERNAL</span></div>
    <div className="login-layout">
      <section className="login-feature">
        <div className="hexagon hexagon-a" />
        <div className="hexagon hexagon-b" />
        <div className="hexagon hexagon-c" />
        <div className="hero-left-card">
          <div className="hero-left-badge">ENGINE DEVELOPMENT</div>
          <p className="eyebrow">SZENGINE POWERTRAIN PLATFORM</p>
          <h1>A fékpad minden<br /> <span>adata. Egy helyen.</span></h1>
          <p className="hero-desc">Élő állapotkövetés, hibadokumentáció, indítási és leállítási protokollok egy közös, belső felületen.</p>
          <div className="login-feature-grid">
            <div><Activity size={21} /><b>Állapotkövetés</b><span>Frissülő fékpadstátusz</span></div>
            <div><ListChecks size={21} /><b>Checklist</b><span>Dokumentált ellenőrzések</span></div>
            <div><ShieldCheck size={21} /><b>Hozzáférés</b><span>Szerepkör alapú védelem</span></div>
          </div>
          
        </div>
        <div className="hero-decor"><div className="hero-chart"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div><div className="hero-decor-copy">TRACK. DOCUMENT. IMPROVE.<small>FORMULA STUDENT TESTBENCH MANAGEMENT</small></div></div>
      </section>
      <section className="login-box">
        <div className="login-icon"><LockKeyhole size={23} /></div>
        <p className="eyebrow">BIZTONSÁGOS BELÉPÉS</p>
        <h2>Üdvözlünk újra!</h2>
        <p className="muted">A fékpad kezelőfelülete csak jogosult csapattagok számára érhető el.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">Felhasználónév</label>
          <div className="input-icon"><UserRound size={18}/><input id="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} placeholder="felhasználónév" required /></div>
          <label htmlFor="password">Jelszó / hozzáférési kód</label>
          <div className="input-icon"><LockKeyhole size={18}/><input id="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Hozzáférési kód" required /><button type="button" className="input-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó mutatása"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17}/>}</button></div>
          {error && <div className="form-error" role="alert"><AlertTriangle size={16} />{error}</div>}
          <button type="submit" className="button primary login-submit" disabled={loading}>{loading ? 'Bejelentkezés...' : 'Belépés a rendszerbe'} <ArrowRight size={17}/></button>
        </form>
        {backend.demoMode && <div className="demo-login"><strong><CircleDot size={14}/> DEMÓ ÜZEMMÓD</strong><p>A megjelenítéshez: <code>dominik</code> / <code>Demo12345!</code>.<br/>Operátor: <code>operator</code>; megfigyelő: <code>megfigyelo</code> (ugyanazzal a jelszóval).</p><small>A demó nem használ valódi hitelesítést vagy adatbázist.</small></div>}
        <p className="login-foot">Hozzáférésért fordulj a rendszer adminisztrátorához.</p>
      </section>
    </div>
    <div className="login-bottom">© SZEngine · Testbench Management <span>INTERNAL OPERATIONS PLATFORM</span></div>
  </main>;
}

function Sidebar({ tab, setTab, user, logout, activeIssues }: { tab: Tab; setTab: (t: Tab) => void; user: Profile; logout: () => void; activeIssues: number }) {
  const nav: { tab: Tab; name: string; icon: ReactNode; count?: number }[] = [
    { tab: 'dashboard', name: 'Áttekintés', icon: <LayoutDashboard size={19}/> },
    { tab: 'issues', name: 'Hibajegyek', icon: <FileWarning size={19}/>, count: activeIssues },
    { tab: 'checklists', name: 'Checklistek', icon: <ClipboardCheck size={19}/> },
    { tab: 'runs', name: 'Járatások', icon: <History size={19}/> },
    ...(user.role === 'admin' ? [{ tab: 'members' as Tab, name: 'Jogosultságok', icon: <UsersRound size={19}/> }] : []),
  ];
  return <aside className="sidebar">
    <div className="sidebar-logo"><Brand /></div>
    <p className="nav-caption">MUNKATERÜLET</p>
    <nav aria-label="Oldalak" className="side-nav">
      {nav.map(x => <button key={x.tab} className={`nav-item ${tab === x.tab ? 'nav-active' : ''}`} onClick={() => setTab(x.tab)}>{x.icon}<span>{x.name}</span>{!!x.count && <span className="nav-count">{x.count}</span>}{tab === x.tab && <span className="nav-active-bar"/>}</button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="system-status"><span className="live-dot"/><div><strong>{backend.demoMode ? 'Demó megjelenítés' : 'Supabase kapcsolat'}</strong><small>{backend.demoMode ? 'Nincs távoli adatkapcsolat' : 'Supabase adatkapcsolat'}</small></div></div>
      <div className="sidebar-user"><div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div><div className="user-lines"><strong>{user.username}</strong><small>{roleName[user.role]}</small></div><button title="Kijelentkezés" className="logout-icon" onClick={logout}><LogOut size={18}/></button></div>
    </div>
  </aside>;
}

function Dashboard({ snap, user, tick, mutate, navigate, busy }: { snap: Snapshot; user: Profile; tick: number; mutate: (fn: () => Promise<unknown>) => Promise<boolean>; navigate: Navigate; busy: boolean }) {
  const [pendingStatus, setPendingStatus] = useState<BenchStatus>(snap.state.status);
  const [note, setNote] = useState(snap.state.note);
  useEffect(() => { setPendingStatus(snap.state.status); setNote(snap.state.note); }, [snap.state.status, snap.state.note]);
  const canEdit = user.role !== 'viewer';
  const openIssues = snap.issues.filter(x => x.status !== 'done');
  const recent = snap.issues.slice(0, 3);
  const activeRun = snap.workflowRuns.find(isOpen);
  const activeChecklists = snap.workflowRuns.filter(r => r.stage === 'preparing' || r.stage === 'shutdown');
  return <>
    <div className="page-heading"><div><p className="eyebrow">POWERTRAIN / TESTBENCH</p><h1>Fékpad áttekintés</h1><p className="page-sub">A mérőrendszer aktuális állapota és legfontosabb információi.</p></div><Chip color={backend.demoMode ? 'amber' : 'green'}><Radio size={13}/>{backend.demoMode ? 'DEMÓ ADATOK' : 'ÉLŐ ADATKAPCSOLAT'}</Chip></div>
    <Card className={`hero-status ${statusClass(snap.state.status)}`}>
      <div className="hero-upper"><div className="hero-label"><Activity size={17}/> FÉKPAD ÜZEMI ÁLLAPOT</div><span className="hero-timestamp"><Clock3 size={15}/> Utolsó frissítés: {dateString(snap.state.updated_at)}</span></div>
      <div className="hero-center"><div className="pulse-ring"><Power size={47}/></div><div><p className="state-overline">AKTUÁLIS ÁLLAPOT</p><h2>{statusName[snap.state.status]}</h2><p>{snap.state.note || 'Nincs hozzáadott megjegyzés az aktuális állapothoz.'}</p></div></div>
    </Card>
    <div className="stat-grid">
      <Card className="stat-card"><div className="stat-head"><span>LEGUTÓBBI JÁRATÁS ÓTA</span><div className="stat-icon stat-red"><Clock3 size={20}/></div></div><strong className="stat-value elapsed">{relativeTime(snap.state.last_run_at, tick)}</strong><small>{snap.state.last_run_at ? `Utolsó leállítás: ${dateString(snap.state.last_run_at)}` : 'Nincs még rögzített leállítás'}</small></Card>
      <Card className="stat-card"><div className="stat-head"><span>NYITOTT HIBAJEGYEK</span><div className="stat-icon stat-amber"><AlertTriangle size={20}/></div></div><strong className="stat-value">{openIssues.length.toString().padStart(2, '0')}</strong><small>{openIssues.filter(i => i.priority === 'high').length} magas prioritású hiba</small></Card>
      <Card className="stat-card"><div className="stat-head"><span>AKTÍV CHECKLIST</span><div className="stat-icon stat-blue"><ListChecks size={20}/></div></div><strong className="stat-value">{activeChecklists.length.toString().padStart(2, '0')}</strong><small>{activeChecklists.length ? 'Ellenőrzés folyamatban' : 'Nincs folyamatban ellenőrzés'}</small></Card>
    </div>
    <Card className="status-edit-panel">
      {activeRun ? <div className="wf-dashboard-link"><div><strong>Járatás #{activeRun.number} – {stageName[activeRun.stage]}</strong><p className="muted">Az állapot módosítása a járatási folyamatban történik.</p></div><button className="button primary" onClick={()=>navigate('checklists')}>Aktív járatás <ArrowRight size={17}/></button></div> : canEdit ? <div className="status-editor"><div><span className="editor-label">ÁLLAPOT MÓDOSÍTÁSA</span><div className="status-options">{statuses.map(s => <button type="button" key={s} onClick={() => setPendingStatus(s)} aria-pressed={pendingStatus === s} className={`status-option ${pendingStatus === s ? 'chosen' : ''}`}>{statusName[s]}</button>)}</div></div><div className="status-note-wrap"><label htmlFor="state-note">Megjegyzés</label><div className="note-apply"><input id="state-note" maxLength={500} placeholder="Pl. mérésre előkészítve" value={note} onChange={e => setNote(e.target.value)}/><button className="button primary" disabled={busy || (pendingStatus === snap.state.status && note === snap.state.note)} onClick={() => mutate(() => backend.setStatus(pendingStatus, note, user))}>Mentés <Check size={16}/></button></div></div></div> : <div className="read-only-hint"><Eye size={16}/> Megtekintési jogosultság. Állapotmódosításhoz operátori hozzáférés szükséges.</div>}
    </Card>
    <div className="dashboard-lower">
      <Card className="details-panel"><SectionTitle icon={<FileWarning size={20}/>} title="Legutóbbi hibajegyek" action={<button className="text-action" onClick={() => navigate('issues')}>Összes megtekintése <ChevronRight size={16}/></button>}/>
        <div className="issue-preview-list">{recent.length ? recent.map(i => <div key={i.id} className="issue-preview"><span className={`issue-dot priority-${i.priority}`}/><div className="issue-preview-main"><strong>{i.title}</strong><small>{dateString(i.created_at)}</small></div><Chip color={i.status === 'done' ? 'green' : i.status === 'in_progress' ? 'blue' : 'red'}>{issueName[i.status]}</Chip></div>) : <div className="empty">Nincs rögzített hiba.</div>}</div>
      </Card>
      <Card className="details-panel"><SectionTitle icon={<ClipboardCheck size={20}/>} title="Gyors elérés"/>
        <button className="quick-link" onClick={() => navigate('checklists')}><span className="quick-icon"><CheckCheck size={22}/></span><span><strong>Aktív / új járatás</strong><small>Indítási és leállítási ellenőrzések</small></span><ArrowRight size={18}/></button>
        <button className="quick-link" onClick={() => navigate('runs')}><span className="quick-icon"><Power size={22}/></span><span><strong>Járatási napló</strong><small>Korábbi párosított checklistek</small></span><ArrowRight size={18}/></button>
        {canEdit && <button className="quick-link" onClick={() => navigate('issues', { newIssue: true })}><span className="quick-icon"><FileWarning size={22}/></span><span><strong>Hiba felvétele</strong><small>Új rendellenesség dokumentálása</small></span><ArrowRight size={18}/></button>}
      </Card>
    </div>
    <Card className="history-panel"><SectionTitle icon={<History size={19}/>} title="Legutóbbi állapotváltozások"/>{snap.events.length ? <div className="history-row-wrap">{snap.events.slice(0, 4).map(e => <div className="history-row" key={e.id}><span className={`event-marker ${statusClass(e.to_status)}`}/><div><strong>{statusName[e.from_status]} <ArrowRight size={13}/> {statusName[e.to_status]}</strong>{e.note && <small>{e.note}</small>}</div><time>{dateString(e.changed_at)}</time></div>)}</div> : <p className="muted">Még nincs rögzített állapotváltozás.</p>}</Card>
  </>;
}

function Issues({ snap, user, mutate, busy, initialNew = false, faultRun, onReturn }: { snap: Snapshot; user: Profile; initialNew?: boolean; faultRun?: Run; onReturn: () => void; mutate: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [newOpen, setNewOpen] = useState(initialNew && user.role !== 'viewer');
  const [title, setTitle] = useState(faultRun ? `Járatás #${faultRun.number} – hiba miatti leállítás` : '');
  const [description, setDescription] = useState(faultRun ? `Járatás #${faultRun.number}\nCél: ${faultRun.setup.purpose}\nHiba leírása: ` : '');
  const [priority, setPriority] = useState<Priority>(faultRun ? 'high' : 'medium');
  const [estimate, setEstimate] = useState('');
  const [filter, setFilter] = useState<'all' | IssueStatus>('all');
  const [search, setSearch] = useState('');
  const canEdit = user.role !== 'viewer';
  const filtered = snap.issues.filter(i => (filter === 'all' || i.status === filter) && `${i.title} ${i.description}`.toLocaleLowerCase('hu').includes(search.toLocaleLowerCase('hu')));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await mutate(() => backend.addIssue({ title: title.trim(), description: description.trim(), priority, estimated_fix_at: estimate ? new Date(estimate).toISOString() : null, ...(faultRun ? {workflow_run_id:faultRun.id} : {}) }, user));
    if (ok) { if(faultRun){onReturn();return;} setNewOpen(false); setTitle(''); setDescription(''); setEstimate(''); }
  };
  return <>
    <div className="page-heading"><div><p className="eyebrow">DOKUMENTÁCIÓ / HIBAKÖVETÉS</p><h1>Hibajegyek</h1><p className="page-sub">Rögzítsd, kövesd és zárd le a fékpad hibáit.</p></div>{canEdit && <button className="button primary" onClick={() => setNewOpen(!newOpen)}><Plus size={18}/> Új hiba felvétele</button>}</div>
    {faultRun&&<div className="wf-notice"><AlertTriangle size={18}/><span>Járatás #{faultRun.number} – a hibajegy ehhez a járatáshoz lesz kapcsolva. Mentés után visszatérsz a járatáshoz.</span><button className="button secondary" onClick={onReturn}>Vissza a checklisthez</button></div>}
    {newOpen && <Card className="form-panel"><SectionTitle icon={<Plus size={19}/>} title="Új hibajegy létrehozása" action={<button className="icon-btn" onClick={() => setNewOpen(false)}><X size={19}/></button>}/><form onSubmit={submit} className="issue-form"><div className="form-field wide"><label>Hiba megnevezése</label><input required minLength={3} maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="Pl. nyomásszenzor hibás jel"/></div><div className="form-field wide"><label>Leírás</label><textarea rows={3} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Mi történt, milyen körülmények között?"/></div><div className="form-field"><label>Prioritás</label><select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="low">Alacsony</option><option value="medium">Közepes</option><option value="high">Magas</option></select></div><div className="form-field"><label>Tervezett megoldási idő (opcionális)</label><input type="datetime-local" value={estimate} onChange={e => setEstimate(e.target.value)}/></div><button className="button primary" disabled={busy} type="submit"><Check size={17}/> Hiba rögzítése</button></form></Card>}
    <Card className="list-panel"><div className="filter-bar"><div className="search-box"><Search size={18}/><input placeholder="Keresés a hibák között..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="filter-select"><SlidersHorizontal size={17}/><select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Minden állapot</option>{issueStatuses.map(s => <option key={s} value={s}>{issueName[s]}</option>)}</select><ChevronDown size={14}/></div></div>
      <div className="issues-list">{filtered.length ? filtered.map(issue => <IssueRow key={issue.id} issue={issue} canEdit={canEdit} busy={busy} mutate={mutate}/>) : <div className="empty padded">A szűrésnek megfelelő hibajegy nem található.</div>}</div>
      <div className="list-foot">{filtered.length} hibajegy megjelenítve · {snap.issues.filter(i => i.status !== 'done').length} nyitott</div>
    </Card>
  </>;
}
function IssueRow({ issue, canEdit, busy, mutate }: { issue: Issue; canEdit: boolean; busy: boolean; mutate: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState(issue.estimated_fix_at ? new Date(issue.estimated_fix_at).toISOString().slice(0, 16) : '');
  return <div className={`issue-card ${expanded ? 'expanded' : ''}`}>
    <button className="issue-row-top" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className={`issue-priority-rail priority-${issue.priority}`}/><div className="issue-summary"><strong>{issue.title}</strong><span>#{issue.id.slice(0, 8).toUpperCase()} · {dateString(issue.created_at)}</span></div><Chip color={issue.priority === 'high' ? 'red' : issue.priority === 'medium' ? 'amber' : 'neutral'}>{priorityName[issue.priority]}</Chip><Chip color={issue.status === 'done' ? 'green' : issue.status === 'in_progress' ? 'blue' : 'red'}>{issueName[issue.status]}</Chip><ChevronDown size={18} className={expanded ? 'rotated' : ''}/></button>
    {expanded && <div className="issue-expanded"><p>{issue.description || 'A hibához nem tartozik részletes leírás.'}</p><div className="issue-metadata"><span><CalendarClock size={16}/> Tervezett megoldás: {dateString(issue.estimated_fix_at)}</span><span><Clock3 size={16}/> Frissítve: {dateString(issue.updated_at)}</span></div>{canEdit && <div className="issue-controls"><div className="form-field"><label>Állapot</label><select value={issue.status} disabled={busy} onChange={e => mutate(() => backend.updateIssue(issue.id, { status: e.target.value as IssueStatus }))}>{issueStatuses.map(s => <option key={s} value={s}>{issueName[s]}</option>)}</select></div><div className="form-field"><label>Tervezett megoldás</label><div className="inline-date"><input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}/><button className="button secondary" disabled={busy} onClick={() => mutate(() => backend.updateIssue(issue.id, { estimated_fix_at: date ? new Date(date).toISOString() : null }))}>Mentés</button></div></div></div>}</div>}
  </div>;
}

function Members({ snap, user, mutate, busy }: { snap: Snapshot; user: Profile; mutate: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [search, setSearch] = useState('');
  const filtered = snap.members.filter(p => `${p.username} ${p.email}`.toLowerCase().includes(search.toLowerCase()));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await mutate(() => backend.createMember({ username: username.trim().toLowerCase(), email: email.trim(), password, role }));
    if (ok) { setOpen(false); setUsername(''); setEmail(''); setPassword(''); setRole('viewer'); }
  };
  return <>
    <div className="page-heading"><div><p className="eyebrow">ADMINISZTRÁCIÓ / HOZZÁFÉRÉS</p><h1>Jogosultságkezelés</h1><p className="page-sub">Tagok létrehozása, hozzáférési szintek és fiókállapotok.</p></div><button className="button primary" onClick={() => setOpen(!open)}><Plus size={18}/> Új felhasználó</button></div>
    <div className="role-grid"><Card className="role-card"><div className="role-icon admin-icon"><ShieldCheck size={21}/></div><h3>Adminisztrátor</h3><p>Felhasználó- és jogosultságkezelés, valamint minden operátori művelet.</p></Card><Card className="role-card"><div className="role-icon operator-icon"><Wrench size={21}/></div><h3>Operátor</h3><p>Fékpadállapot módosítása, hibák kezelése és checklistek végrehajtása.</p></Card><Card className="role-card"><div className="role-icon viewer-icon"><Eye size={21}/></div><h3>Megfigyelő</h3><p>Állapotok, hibák és ellenőrzések megtekintése; módosítás nélkül.</p></Card></div>
    {open && <Card className="form-panel"><SectionTitle icon={<Plus size={19}/>} title="Új felhasználó hozzáadása" action={<button className="icon-btn" onClick={() => setOpen(false)}><X size={18}/></button>}/><form onSubmit={submit} className="member-form"><div className="form-field"><label>Felhasználónév (3–30, kisbetű)</label><input required pattern="[a-z0-9._-]{3,30}" value={username} onChange={e => setUsername(e.target.value)} placeholder="pl. elek.bela"/></div><div className="form-field"><label>Email-cím (belső Auth-azonosító)</label><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="csapattag@example.com"/></div><div className="form-field"><label>Kezdeti jelszó (minimum 10 karakter)</label><input required type="password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} placeholder="Legalább 10 karakter"/></div><div className="form-field"><label>Jogosultság</label><select value={role} onChange={e => setRole(e.target.value as Role)}><option value="viewer">Megfigyelő</option><option value="operator">Operátor</option><option value="admin">Adminisztrátor</option></select></div><div className="form-hint"><ShieldCheck size={16}/> A fiók létrehozása csak az adminisztrátori szerverfunkción keresztül történhet.</div><button type="submit" className="button primary" disabled={busy}><Plus size={17}/> Felhasználó létrehozása</button></form></Card>}
    <Card className="list-panel"><SectionTitle icon={<UsersRound size={20}/>} title={`Csapattagok (${snap.members.length})`}/><div className="filter-bar"><div className="search-box"><Search size={18}/><input placeholder="Felhasználó keresése..." value={search} onChange={e => setSearch(e.target.value)}/></div></div><div className="member-table-wrap"><table className="member-table"><thead><tr><th>Felhasználó</th><th>Szerepkör</th><th>Állapot</th><th>Regisztráció</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td className="member-person"><div className="member-id"><span className="avatar avatar-small">{p.username.slice(0,2).toUpperCase()}</span><div><strong>{p.username} {p.id === user.id && <span className="self-label">(te)</span>}</strong><small>{p.email}</small></div></div></td><td className="member-role"><span className="mobile-field-label">Szerepkör</span><select aria-label={`${p.username} jogosultsága`} className="table-select" disabled={busy || p.id === user.id} value={p.role} onChange={e => mutate(() => backend.editMember(p.id, { role: e.target.value as Role }))}><option value="viewer">Megfigyelő</option><option value="operator">Operátor</option><option value="admin">Adminisztrátor</option></select></td><td className="member-state"><span className="mobile-field-label">Fiókállapot</span><button aria-label={`${p.username} fiókállapota`} aria-pressed={p.is_active} className={`account-toggle ${p.is_active ? 'enabled' : 'disabled'}`} disabled={busy || p.id === user.id} onClick={() => mutate(() => backend.editMember(p.id, { is_active: !p.is_active }))}><span className="toggle-track"/><span>{p.is_active ? 'Aktív' : 'Letiltva'}</span></button></td><td className="member-date"><span className="mobile-field-label">Regisztráció</span>{dateString(p.created_at)}</td></tr>)}</tbody></table>{!filtered.length && <div className="empty padded">Nem található megfelelő felhasználó.</div>}</div></Card>
  </>;
}

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [initialNew, setInitialNew] = useState(false);
  const [faultRun,setFaultRun]=useState<Run|undefined>(undefined);
  const navigate: Navigate = (next, options) => {
    setInitialNew(!!options?.newIssue);
    setFaultRun(options?.faultRun);
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!user) return;
    try { const data = await backend.load(user); setSnap(data); }
    catch (e) { setError(errorMessage(e)); }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    backend.currentUser().then(p => { if (mounted) setUser(p); }).catch(() => {}).finally(() => { if (mounted) setInitializing(false); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const unsubscribe = backend.subscribe(() => void refresh());
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [user, refresh]);
  const mutate = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); return true; }
    catch (e) { setError(errorMessage(e)); return false; }
    finally { setBusy(false); }
  }, [refresh]);
  const logout = async () => {
    try { await backend.logout(); setUser(null); setSnap(null); setTab('dashboard'); }
    catch (e) { setError(errorMessage(e)); }
  };
  const activeIssues = useMemo(() => snap?.issues.filter(i => i.status !== 'done').length ?? 0, [snap]);
  if (initializing) return <div className="loading-screen"><Brand/><span><RefreshCw size={17} className="spin"/> Rendszer betöltése...</span></div>;
  if (!user) return <Login onLogin={p => { setUser(p); setError(''); }} />;
  return <div className="app-shell"><Sidebar tab={tab} setTab={navigate} user={user} logout={() => void logout()} activeIssues={activeIssues}/><main className="main-area"><div className="topbar"><div className="mobile-brand"><Brand compact/></div><div className="breadcrumb"><span>SZENGINE</span><ChevronRight size={15}/><span>TESTBENCH</span><ChevronRight size={15}/><strong>{tab === 'dashboard' ? 'Áttekintés' : tab === 'issues' ? 'Hibajegyek' : tab === 'checklists' ? 'Checklistek' : tab === 'runs' ? 'Járatások' : 'Jogosultságok'}</strong></div><div className="topbar-right"><span className="topbar-date">{new Date(tick).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button className="top-refresh" aria-label="Frissítés" title="Adatok frissítése" onClick={() => void refresh()}><RefreshCw size={17}/></button><div className="topbar-avatar" title={`${user.username} · ${roleName[user.role]}`}>{user.username.slice(0,2).toUpperCase()}</div><button className="mobile-logout" aria-label="Kijelentkezés" title="Kijelentkezés" onClick={() => void logout()}><LogOut size={21}/></button></div></div><nav className="mobile-nav" aria-label="Mobil navigáció">
    <button aria-current={tab === 'dashboard' ? 'page' : undefined} className={tab === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><LayoutDashboard size={21}/><span>Főoldal</span></button>
    <button aria-current={tab === 'issues' ? 'page' : undefined} className={tab === 'issues' ? 'active' : ''} onClick={() => navigate('issues')}><span className="mobile-nav-icon"><FileWarning size={21}/>{activeIssues > 0 && <span className="mobile-count">{activeIssues > 99 ? '99+' : activeIssues}</span>}</span><span>Hibák</span></button>
    <button aria-current={tab === 'checklists' ? 'page' : undefined} className={tab === 'checklists' ? 'active' : ''} onClick={() => navigate('checklists')}><ClipboardCheck size={21}/><span>Checklist</span></button>
    <button aria-current={tab === 'runs' ? 'page' : undefined} className={tab === 'runs' ? 'active' : ''} onClick={() => navigate('runs')}><History size={21}/><span>Járatások</span></button>
    {user.role === 'admin' && <button aria-current={tab === 'members' ? 'page' : undefined} className={tab === 'members' ? 'active' : ''} onClick={() => navigate('members')}><UsersRound size={21}/><span>Jogok</span></button>}
    </nav><div className="content">
    {error && <div className="global-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Hibaüzenet bezárása"><X size={17}/></button></div>}
    {!snap ? <div className="content-loading"><RefreshCw size={23} className="spin"/> Adatok betöltése...</div> : <>
      {tab === 'dashboard' && <Dashboard snap={snap} user={user} tick={tick} mutate={mutate} navigate={navigate} busy={busy}/>}
      {tab === 'issues' && <Issues key={faultRun?.id??"general"} initialNew={initialNew} faultRun={faultRun} onReturn={()=>navigate(snap.workflowRuns.some(r=>r.id===faultRun?.id&&isOpen(r))?'checklists':'runs')} snap={snap} user={user} mutate={mutate} busy={busy}/>}
      {tab === 'checklists' && <Workflow onFaultIssue={r=>navigate('issues',{newIssue:true,faultRun:r})} snap={snap} user={user} mutate={mutate} busy={busy}/>}
      {tab === 'runs' && <RunHistory snap={snap} onActive={()=>navigate('checklists')} onFaultIssue={user.role!=='viewer'?r=>navigate('issues',{newIssue:true,faultRun:r}):undefined}/>}
      {tab === 'members' && user.role === 'admin' && <><Members snap={snap} user={user} mutate={mutate} busy={busy}/><ChecklistAdmin snap={snap} user={user} mutate={mutate} busy={busy}/></>}
      <footer className="content-footer"><span>SZENGINE / TESTBENCH MANAGEMENT SYSTEM</span><span>V 0.5.0 · {backend.demoMode ? 'PREVIEW MODE' : 'SUPABASE CONNECTED'}</span></footer>
    </>}
  </div></main></div>;
}
