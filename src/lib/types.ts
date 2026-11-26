import type { Run, WorkflowTemplate, DirectoryMember } from "./workflowTypes";
export type Role = 'admin' | 'operator' | 'viewer';
export type BenchStatus = 'idle' | 'running' | 'maintenance' | 'fault';
export type IssueStatus = 'active' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type ChecklistKind = 'pre_start' | 'shutdown';
export type ChecklistRunStatus = 'in_progress' | 'completed';

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}
export interface BenchState {
  id: number;
  status: BenchStatus;
  note: string;
  last_run_at: string | null;
  updated_at: string;
  updated_by: string | null;
}
export interface Issue {
  id: string;
  workflow_run_id?: string | null;
  title: string;
  description: string;
  priority: Priority;
  status: IssueStatus;
  estimated_fix_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface ChecklistItem {
  id: string;
  kind: ChecklistKind;
  position: number;
  title: string;
  description: string;
}
export interface ChecklistRun {
  id: string;
  kind: ChecklistKind;
  status: ChecklistRunStatus;
  started_at: string;
  completed_at: string | null;
  started_by: string;
}
export interface ChecklistRunItem {
  id: string;
  run_id: string;
  item_id: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
}
export interface StatusEvent {
  id: string;
  from_status: BenchStatus;
  to_status: BenchStatus;
  note: string;
  changed_at: string;
  changed_by: string;
}
export interface Snapshot {
  state: BenchState;
  issues: Issue[];
  events: StatusEvent[];
  members: Profile[];
  workflowRuns: Run[];
  workflowTemplates: WorkflowTemplate[];
  directory: DirectoryMember[];
}
export const roleName: Record<Role, string> = { admin: 'Admin', operator: 'Operátor', viewer: 'Megfigyelő' };
export const statusName: Record<BenchStatus, string> = { idle: 'Leállítva', running: 'Üzemel', maintenance: 'Karbantartás', fault: 'Hiba miatt áll' };
export const issueName: Record<IssueStatus, string> = { active: 'Aktív', in_progress: 'Folyamatban', done: 'Megoldva' };
export const priorityName: Record<Priority, string> = { low: 'Alacsony', medium: 'Közepes', high: 'Magas' };
export const checklistName: Record<ChecklistKind, string> = { pre_start: 'Indítás előtti ellenőrzés', shutdown: 'Leállítási ellenőrzés' };
