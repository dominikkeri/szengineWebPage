import type { ChecklistKind } from './types';
export const setupOptions = {
  motor: ['OEM', 'GEN1'], intake: ['NA', 'SK1', 'NGT'], exhaust: ['NA', 'SK1', 'NGT'],
  muffler: ['Raceshop', 'Gabi', 'RC-1 dob'], cam: ['OEM', 'Állítható', 'Roulett'],
} as const;
export const setupLabels = { motor: 'Motor', intake: 'Szívórendszer', exhaust: 'Leömlő', muffler: 'Kipufogó dob', cam: 'Veztengely' } as const;
export type Setup = Record<keyof typeof setupOptions, string> & { responsible_id: string; map: string; purpose: string; attendees: string; initial_hours: number | null };
export type SavedSetup = Setup & { responsible_name: string };
export type WorkflowStage = 'preparing' | 'ready' | 'running' | 'shutdown' | 'completed' | 'cancelled';
export const stageName: Record<WorkflowStage,string> = { preparing:'Indítás előtti ellenőrzés', ready:'Indításra előkészítve', running:'Járatás folyamatban', shutdown:'Leállítási ellenőrzés', completed:'Lezárva', cancelled:'Megszakított előkészítés' };
export type TemplatePoint = { id: string; group: string; title: string };
export type WorkflowTemplate = { kind: ChecklistKind; revision: number; items: TemplatePoint[] };
export type PointResult = TemplatePoint & { checked_at: string | null; checked_by: string | null; checked_name: string | null; skipped_at?: string | null; skipped_by?: string | null; skipped_name?: string | null };
export type DirectoryMember = { id: string; username: string };
export type Run = { id: string; number: number; stage: WorkflowStage; setup: SavedSetup; created_at: string; created_by: string; created_name: string; pre_revision: number; post_revision: number; pre_items: PointResult[]; post_items: PointResult[]; pre_completed_at: string | null; pre_completed_name: string | null; started_at: string | null; started_name: string | null; stopped_at: string | null; stopped_name: string | null; closed_at: string | null; closed_name: string | null; stop_fault: boolean; };
export const isOpen = (r: Run) => r.stage !== 'completed' && r.stage !== 'cancelled';
export const allResolved = (items: PointResult[]) => items.length > 0 && items.every(i => !!i.checked_at !== !!i.skipped_at);
export function validateSetup(s: Setup, directory: DirectoryMember[]): SavedSetup {
  for (const key of Object.keys(setupOptions) as (keyof typeof setupOptions)[]) if (!(setupOptions[key] as readonly string[]).includes(s[key])) throw Error(`Válaszd ki: ${setupLabels[key]}`);
  const responsible = directory.find(x=>x.id === s.responsible_id);
  if (!responsible) throw Error('Válassz aktív járatásfelelőst.');
  for(const key of ['map','purpose','attendees'] as const) if(!s[key].trim() || s[key].length > 1000) throw Error('A Map neve, cél és jelenlévők mezők kitöltése kötelező (max. 1000 karakter).');
  if(s.initial_hours === null || !Number.isFinite(s.initial_hours) || s.initial_hours < 0 || s.initial_hours > 10000000) throw Error('Adj meg érvényes kezdeti üzemórát.');
  return {...s, responsible_name:responsible.username, map:s.map.trim(),purpose:s.purpose.trim(),attendees:s.attendees.trim()};
}
export function validateTemplate(items: TemplatePoint[]): TemplatePoint[] {
  if (!items.length || items.length > 200 || new Set(items.map(i=>i.id)).size !== items.length || items.some(i=> !i.id || i.id.length>100 || !i.group.trim() || i.group.length>100 || !i.title.trim() || i.title.length>300)) throw Error('A sablon 1–200 egyedi, kitöltött pontot tartalmazhat.');
  return items.map(i=>({id:i.id,group:i.group.trim(),title:i.title.trim()}));
}
