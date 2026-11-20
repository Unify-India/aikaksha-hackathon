import { Service, signal } from '@angular/core';
import { ICreateCompleteExamResponse, IExamIntakeResult } from '../../../shared/models/exam-creation.model';
import { IExamDraft } from './exam-params.rules';

export interface IChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
}

export interface IChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: IChatMessage[];
  draft: IExamDraft;
  result: IExamIntakeResult | null;
  /** Set once POST /api/exams/create-complete succeeded. */
  createdExam?: ICreateCompleteExamResponse | null;
}

const STORAGE_KEY = 'aikaksha.voiceCopilot.sessions.v1';
const MAX_SESSIONS = 30;

/**
 * Past Voice Copilot conversations, kept in this browser only (localStorage).
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded and
 * the page works without it.
 */
@Service()
export class ChatHistoryStore {
  private readonly _sessions = signal<IChatSession[]>(read());
  /** Newest first. */
  readonly sessions = this._sessions.asReadonly();

  upsert(session: IChatSession): void {
    const rest = this._sessions().filter((s) => s.id !== session.id);
    const next = [session, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
    this._sessions.set(next);
    write(next);
  }

  remove(id: string): void {
    const next = this._sessions().filter((s) => s.id !== id);
    this._sessions.set(next);
    write(next);
  }

  get(id: string): IChatSession | undefined {
    return this._sessions().find((s) => s.id === id);
  }
}

function read(): IChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as IChatSession[]).filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages)) : [];
  } catch {
    return [];
  }
}

function write(sessions: IChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage full or blocked: history is a convenience, so keep the in-memory copy only.
  }
}
