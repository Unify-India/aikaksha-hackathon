import { Service, computed, inject, signal } from '@angular/core';
import { GeminiError } from '../../../core/services/ai/gemini.service';
import { QUESTION_GEN_KEYS } from './gemini-keys';
import { FunctionCall, FunctionResponse, FunctionResponseScheduling } from '@google/genai';
import { ExamApiError, ExamApiService } from '../../../core/services/exam-api.service';
import { ICreateCompleteExamResponse, IExamIntakeResult, IQuestionItemPayload } from '../../../shared/models/exam-creation.model';
import { AudioIo } from './audio-io';
import { ChatHistoryStore, IChatMessage, IChatSession } from './chat-history.store';
import { FINALIZE_TOOL, UPDATE_DRAFT_TOOL, buildSystemInstruction, buildToolDeclarations } from './exam-intake.prompt';
import { IDraftEvaluation, IExamDraft, IRulesContext, dateInZone, evaluateDraft, mentionsBatch, timeInZone, sanitizeDraftArgs, toolVerdict } from './exam-params.rules';
import { GeminiLiveClient, ILiveHandlers } from './gemini-live.client';
import { IGenerationProgress, QuestionGenerator } from './question-generator';
import { BATCH_ALIASES, INSTITUTE_TIMEZONE, TEACHER_BATCHES, TEACHER_NAME } from './teacher-context';

export type IntakeStatus = 'idle' | 'connecting' | 'live' | 'complete' | 'error';

/** After the teacher confirms: generate the questions, then POST /api/exams/create-complete. */
export interface ICreationState {
  phase: 'idle' | 'generating' | 'saving' | 'created' | 'failed';
  progress?: IGenerationProgress;
  exam?: ICreateCompleteExamResponse;
  error?: string;
  /** Question generation hit a Gemini quota error (429): the card offers other keys. */
  quotaExceeded?: boolean;
  /** Label of the key used for the last attempt, when the teacher picked one. */
  keyLabel?: string;
}

const QUESTION_KEY_STORAGE = 'aiKaksha.questionKeyId';

function readStoredKeyId(): string {
  try {
    const id = localStorage.getItem(QUESTION_KEY_STORAGE) ?? '';
    return QUESTION_GEN_KEYS.some((k) => k.id === id) ? id : '';
  } catch {
    return '';
  }
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * State and orchestration for the Voice Copilot conversation.
 *
 * Gemini Live does the talking; this store owns the truth. Every `update_exam_draft` call is
 * merged into `draft`, re-evaluated by the pure rules, and the verdict (missing / invalid /
 * next step) goes back to the model as the tool response — so follow-up questions are driven
 * by code, not by the prompt alone.
 */
@Service()
export class ExamIntakeStore {
  private readonly live = inject(GeminiLiveClient);
  private readonly audio = inject(AudioIo);
  private readonly history = inject(ChatHistoryStore);
  private readonly generator = inject(QuestionGenerator);
  private readonly examApi = inject(ExamApiService);

  readonly status = signal<IntakeStatus>('idle');
  readonly messages = signal<IChatMessage[]>([]);
  readonly draft = signal<IExamDraft>({});
  readonly result = signal<IExamIntakeResult | null>(null);
  readonly error = signal<string | null>(null);
  /** Non-blocking hint, e.g. "microphone unavailable — type instead". */
  readonly notice = signal<string | null>(null);
  /** A past session opened read-only from the sidebar. */
  readonly viewing = signal<IChatSession | null>(null);
  readonly creation = signal<ICreationState>({ phase: 'idle' });
  /** Gemini key for question generation ('' = server key via the relay); remembered in this browser. */
  readonly questionKeyId = signal(readStoredKeyId());

  readonly micOn = this.audio.micOn;
  readonly agentSpeaking = this.audio.playing;
  readonly sessions = this.history.sessions;
  readonly configured = this.live.isConfigured();
  readonly micSupported = AudioIo.micSupported;

  readonly evaluation = computed<IDraftEvaluation>(() => evaluateDraft(this.draft(), this.rulesContext()));
  readonly visibleMessages = computed(() => this.viewing()?.messages ?? this.messages());
  readonly visibleResult = computed(() => (this.viewing() ? this.viewing()!.result : this.result()));
  readonly visibleCreation = computed<ICreationState>(() => {
    const viewing = this.viewing();
    if (!viewing) return this.creation();
    return viewing.createdExam ? { phase: 'created', exam: viewing.createdExam } : { phase: 'idle' };
  });
  readonly visibleEvaluation = computed<IDraftEvaluation>(() => {
    const viewing = this.viewing();
    return viewing ? evaluateDraft(viewing.draft, this.rulesContext()) : this.evaluation();
  });
  readonly activeSessionId = computed(() => this.viewing()?.id ?? this.sessionId());
  /**
   * Switch from the centred empty state to the chat layout only once there is something to show.
   * Connecting or turning the mic on must not move the composer (it used to jump down and back).
   */
  readonly started = computed(() => this.visibleMessages().length > 0);
  /** The agent has everything and is waiting for the teacher's go-ahead. */
  readonly awaitingConfirmation = computed(() => this.status() === 'live' && this.evaluation().complete && !this.result());

  private readonly sessionId = signal(newId('chat'));
  private createdAt = Date.now();
  private userMsgId: string | null = null;
  private agentMsgId: string | null = null;
  private connecting: Promise<void> | null = null;
  /** Set when the rules first report "complete"; finalize needs the teacher to speak after that. */
  private confirmationAsked = false;
  private teacherRepliedSinceConfirm = false;
  private closeAfterTurn = false;
  /** Kept across retries: questions are not regenerated, and X-Request-ID stays the same (idempotency). */
  private generatedQuestions: IQuestionItemPayload[] | null = null;
  private createRequestId: string | null = null;
  /** The agent has started speaking in the current turn (decides SILENT vs WHEN_IDLE tool responses). */
  private agentAudioThisTurn = false;

  async toggleMic(): Promise<void> {
    if (this.audio.micOn()) {
      this.audio.stopMic();
      return;
    }
    if (!this.micSupported) {
      this.notice.set('Voice input is not supported in this browser. Type your request instead.');
      return;
    }
    await this.ensureSession();
    if (!this.live.isOpen) return;
    try {
      await this.audio.startMic((chunk) => this.live.sendAudio(chunk));
      this.notice.set(null);
    } catch {
      this.notice.set('Microphone is blocked or unavailable. Allow mic access, or type your request instead.');
    }
  }

  async sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.viewing() || this.result()) return;
    this.userMsgId = null;
    this.pushMessage('user', trimmed);
    this.teacherSpoke();
    await this.ensureSession();
    this.live.sendText(trimmed);
  }

  /** Teacher confirmed from the on-screen button instead of saying "yes". */
  confirmFromButton(): void {
    if (this.finalize('teacher').ok) {
      this.audio.flush();
      this.endSession();
    }
  }

  newChat(): void {
    this.persist();
    this.endSession();
    this.viewing.set(null);
    this.messages.set([]);
    this.draft.set({});
    this.result.set(null);
    this.error.set(null);
    this.notice.set(null);
    this.status.set('idle');
    this.sessionId.set(newId('chat'));
    this.createdAt = Date.now();
    this.confirmationAsked = false;
    this.teacherRepliedSinceConfirm = false;
    this.creation.set({ phase: 'idle' });
    this.generatedQuestions = null;
    this.createRequestId = null;
  }

  /** Generate the questions (once) and create the exam on the server. Also the Retry action. */
  /** Picks the key for question generation (key picker / quota buttons). */
  selectQuestionKey(keyId: string): void {
    this.questionKeyId.set(keyId);
    try {
      localStorage.setItem(QUESTION_KEY_STORAGE, keyId);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  }

  /** `keyId` (from the quota buttons) also becomes the selected key. */
  async createExam(keyId?: string): Promise<void> {
    if (keyId !== undefined) this.selectQuestionKey(keyId);
    const intake = this.result();
    const phase = this.creation().phase;
    if (!intake || phase === 'generating' || phase === 'saving' || phase === 'created') return;
    const chatId = this.sessionId();
    const stillHere = () => this.sessionId() === chatId; // the teacher may start a new chat meanwhile
    const requestId = (this.createRequestId ??= crypto.randomUUID());

    if (!this.generatedQuestions) {
      if (!this.generator.isConfigured()) {
        this.creation.set({ phase: 'failed', error: 'Gemini is not configured, so questions cannot be generated (set gemini.apiKey).' });
        return;
      }
      const key = QUESTION_GEN_KEYS.find((k) => k.id === this.questionKeyId());
      const keyLabel = key?.label;
      this.creation.set({ phase: 'generating', keyLabel, progress: { done: 0, total: intake.examParams.targetQuestions } });
      try {
        const questions = await this.generator.generate(
          intake,
          (progress) => stillHere() && this.creation.set({ phase: 'generating', keyLabel, progress }),
          key?.apiKey,
        );
        if (!stillHere()) return;
        this.generatedQuestions = questions;
      } catch (err) {
        if (stillHere()) {
          this.creation.set({
            phase: 'failed',
            keyLabel,
            quotaExceeded: err instanceof GeminiError && err.status === 429,
            error: `Question generation failed${keyLabel ? ` (${keyLabel}'s key)` : ''}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        return;
      }
    }

    const questions = this.generatedQuestions;
    if (!questions) return;
    this.creation.set({ phase: 'saving' });
    try {
      const exam = await this.examApi.createCompleteExam(
        { examParams: { ...intake.examParams, targetQuestions: questions.length }, questions },
        requestId,
      );
      if (!stillHere()) return;
      this.creation.set({ phase: 'created', exam });
      console.log('[VoiceCopilot] Exam created', exam);
      this.persist();
    } catch (err) {
      if (!stillHere()) return;
      const message =
        err instanceof ExamApiError && err.code === 'IDEMPOTENCY_CONFLICT'
          ? 'This exam was already submitted to the server (same request). Check the exam list before creating it again.'
          : err instanceof Error
            ? err.message
            : String(err);
      this.creation.set({ phase: 'failed', error: message });
    }
  }

  openSession(id: string): void {
    if (id === this.sessionId()) {
      this.viewing.set(null);
      return;
    }
    const session = this.history.get(id);
    if (!session) return;
    this.persist();
    this.endSession();
    if (this.status() !== 'complete') this.status.set('idle');
    this.viewing.set(session);
  }

  /** Remove a conversation from history; deleting the open one (live or viewed) starts a fresh chat. */
  deleteSession(id: string): void {
    const isOpen = id === this.sessionId() || id === this.viewing()?.id;
    if (id === this.sessionId()) this.messages.set([]); // so newChat() does not save it again
    this.history.remove(id);
    if (isOpen) this.newChat();
  }

  /** Leaving the page: keep the transcript, drop the connection. A later interaction reconnects. */
  suspend(): void {
    this.persist();
    this.endSession();
    this.audio.dispose();
    if (this.status() === 'live' || this.status() === 'connecting') this.status.set('idle');
  }

  async reconnect(): Promise<void> {
    this.error.set(null);
    this.status.set('idle');
    await this.ensureSession();
    // Re-send the teacher's last message if the connection dropped before the agent answered it.
    const last = this.messages().at(-1);
    if (this.live.isOpen && last?.role === 'user' && last.text.trim()) this.live.sendText(last.text.trim());
  }

  // ── Session ──────────────────────────────────────────────────────────────

  private async ensureSession(): Promise<void> {
    if (this.live.isOpen || this.result()) return;
    if (this.connecting) return this.connecting;
    if (!this.configured) {
      this.status.set('error');
      this.error.set('Gemini is not configured. Set gemini.apiKey and gemini.liveModel in src/environments/environment.ts.');
      return;
    }
    this.connecting = this.connectLive();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectLive(): Promise<void> {
    this.status.set('connecting');
    this.error.set(null);
    try {
      await this.audio.unlockSpeaker();
      await this.live.connect(
        {
          systemInstruction: buildSystemInstruction({
            now: new Date(),
            timeZone: INSTITUTE_TIMEZONE,
            teacherName: TEACHER_NAME,
            batches: TEACHER_BATCHES,
          }),
          tools: buildToolDeclarations(TEACHER_BATCHES),
        },
        this.handlers,
      );
      this.status.set('live');
      const collected = this.draft();
      if (Object.keys(collected).length) {
        this.live.sendText(
          `(System note: the connection was restored. Fields already saved: ${JSON.stringify(collected)}. Do not ask for these again; continue with what is missing.)`,
        );
      }
    } catch (err) {
      this.status.set('error');
      this.error.set(`Could not connect to Gemini Live: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private endSession(): void {
    this.closeAfterTurn = false;
    this.audio.stopMic();
    this.live.close();
    this.userMsgId = null;
    this.agentMsgId = null;
  }

  private readonly handlers: ILiveHandlers = {
    onAudio: (pcm) => {
      this.agentAudioThisTurn = true;
      this.audio.play(pcm);
    },
    onInputTranscript: (text) => {
      // Count a reply once per utterance: late fragments of the utterance that completed the draft
      // must not count as the teacher confirming the read-back.
      if (!this.userMsgId) {
        this.userMsgId = this.pushMessage('user', '', this.agentMsgId);
        this.teacherSpoke();
      }
      this.appendText(this.userMsgId, text);
    },
    onOutputTranscript: (text) => {
      if (!this.agentMsgId) this.agentMsgId = this.pushMessage('agent', '');
      this.appendText(this.agentMsgId, text);
    },
    onToolCalls: (calls) => this.live.sendToolResponses(calls.map((call) => this.handleToolCall(call))),
    onInterrupted: () => {
      // The teacher talked over the agent: stop playback; their words keep filling the current bubble.
      this.audio.flush();
      this.agentMsgId = null;
      this.agentAudioThisTurn = false;
    },
    onTurnComplete: () => {
      this.agentAudioThisTurn = false;
      this.userMsgId = null;
      this.agentMsgId = null;
      this.persist();
      if (this.closeAfterTurn) this.endSession();
    },
    onClose: (reason) => {
      this.audio.stopMic();
      this.userMsgId = null;
      this.agentMsgId = null;
      if (this.result()) return;
      this.status.set('error');
      this.error.set(`Gemini Live disconnected: ${reason}`);
      this.persist();
    },
  };

  // ── Tools ────────────────────────────────────────────────────────────────

  private handleToolCall(call: FunctionCall): FunctionResponse {
    const respond = (response: Record<string, unknown>): FunctionResponse => ({ id: call.id, name: call.name, response });
    const respondAsync = (scheduling: FunctionResponseScheduling, response: Record<string, unknown>): FunctionResponse => ({
      ...respond(response),
      scheduling,
    });
    switch (call.name) {
      case UPDATE_DRAFT_TOOL: {
        const { batchId, ...patch } = sanitizeDraftArgs(call.args, this.rulesContext().today);
        const batchRejected = batchId !== undefined && batchId !== this.draft().batchId && !this.teacherChoseBatch(batchId);
        this.draft.update((d) => {
          const next: IExamDraft = { ...d, ...patch, ...(batchId && !batchRejected ? { batchId } : {}) };
          // A new start time without an end time: drop the old explicit end so it follows start + duration.
          if (patch.startTime && !patch.endTime) delete next.endTime;
          return next;
        });
        const ev = this.evaluation();
        if (batchRejected) {
          const batch = TEACHER_BATCHES.find((b) => b.id === batchId);
          return respondAsync(FunctionResponseScheduling.WHEN_IDLE, {
            ...toolVerdict(ev),
            batchNotChosen: `The teacher has not chosen a batch. Ask them: "Is this for ${batch?.name ?? batchId} (${batch?.classLevel ?? ''})?" Set batchId only after they agree or name a batch.`,
          });
        }
        if (ev.complete && !this.confirmationAsked) {
          this.confirmationAsked = true;
          this.teacherRepliedSinceConfirm = false;
        } else if (!ev.complete) {
          this.confirmationAsked = false;
        }
        // update_exam_draft is NON_BLOCKING: stay quiet if the agent is already answering and nothing
        // needs correcting; otherwise let it speak once its current sentence ends.
        const verdict = toolVerdict(ev);
        const quiet = this.agentAudioThisTurn && ev.invalid.length === 0;
        return respondAsync(quiet ? FunctionResponseScheduling.SILENT : FunctionResponseScheduling.WHEN_IDLE, verdict);
      }
      case FINALIZE_TOOL:
        return respond(this.finalize('agent'));
      default:
        return respond({ error: `Unknown tool ${call.name}` });
    }
  }

  /**
   * The batch must be the teacher's choice: accept it when the teacher named it, or when the agent
   * named it aloud (a question or the read-back) and the teacher replied after that.
   */
  private teacherChoseBatch(batchId: string): boolean {
    const aliases = BATCH_ALIASES[batchId] ?? [];
    const list = this.messages();
    if (list.some((m) => m.role === 'user' && mentionsBatch(m.text, aliases))) return true;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === 'agent' && mentionsBatch(list[i].text, aliases)) {
        return list.slice(i + 1).some((m) => m.role === 'user' && m.text.trim());
      }
    }
    return false;
  }

  private finalize(source: 'agent' | 'teacher'): { ok: boolean; [key: string]: unknown } {
    if (this.result()) return { ok: true, note: 'Already finalized.' };
    const ev = this.evaluation();
    if (!ev.complete || !ev.result) return { ok: false, ...toolVerdict(ev) };
    if (source === 'agent' && !(this.confirmationAsked && this.teacherRepliedSinceConfirm)) {
      return { ok: false, reason: 'Read the summary back to the teacher and wait for their explicit confirmation first.' };
    }
    this.result.set(ev.result);
    this.status.set('complete');
    this.audio.stopMic();
    this.closeAfterTurn = true;
    this.persist();
    void this.createExam();
    return { ok: true, note: 'Confirmed. Say one short sentence that you are now generating the questions and creating the exam; the screen shows the progress.' };
  }

  // ── Messages & persistence ──────────────────────────────────────────────

  private teacherSpoke(): void {
    if (this.confirmationAsked) this.teacherRepliedSinceConfirm = true;
  }

  /** Adds a message (optionally before another one, so a late voice transcript stays above the reply). */
  private pushMessage(role: IChatMessage['role'], text: string, beforeId: string | null = null): string {
    const message: IChatMessage = { id: newId('msg'), role, text, at: Date.now() };
    this.messages.update((list) => {
      const index = beforeId ? list.findIndex((m) => m.id === beforeId) : -1;
      return index < 0 ? [...list, message] : [...list.slice(0, index), message, ...list.slice(index)];
    });
    return message.id;
  }

  private appendText(id: string, text: string): void {
    this.messages.update((list) => list.map((m) => (m.id === id ? { ...m, text: m.text + text } : m)));
  }

  private persist(): void {
    const messages = this.messages().filter((m) => m.text.trim());
    if (!messages.length) return;
    const result = this.result();
    const firstUser = messages.find((m) => m.role === 'user')?.text ?? 'New chat';
    this.history.upsert({
      id: this.sessionId(),
      title: (result?.examParams.title ?? this.draft().topic ?? firstUser).trim().slice(0, 60),
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      messages,
      draft: this.draft(),
      result,
      createdExam: this.creation().exam ?? null,
    });
  }

  private rulesContext(): IRulesContext {
    const now = new Date();
    return { today: dateInZone(now, INSTITUTE_TIMEZONE), nowTime: timeInZone(now, INSTITUTE_TIMEZONE), batches: TEACHER_BATCHES };
  }
}
