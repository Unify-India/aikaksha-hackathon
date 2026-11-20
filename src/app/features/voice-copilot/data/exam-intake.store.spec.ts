import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FunctionCall, FunctionResponse } from '@google/genai';
import { AudioIo } from './audio-io';
import { ExamIntakeStore } from './exam-intake.store';
import { FINALIZE_TOOL, UPDATE_DRAFT_TOOL } from './exam-intake.prompt';
import { GeminiLiveClient, ILiveHandlers, ILiveSessionConfig } from './gemini-live.client';
import { QuestionGenerator } from './question-generator';
import { ExamApiError, ExamApiService } from '../../../core/services/exam-api.service';
import { ICreateCompleteExamRequest, IExamIntakeResult, IQuestionItemPayload } from '../../../shared/models/exam-creation.model';

/** Stands in for the WebSocket: records what the store sends and lets tests play the server. */
class FakeLiveClient {
  handlers: ILiveHandlers | null = null;
  config: ILiveSessionConfig | null = null;
  texts: string[] = [];
  toolResponses: FunctionResponse[] = [];
  isOpen = false;
  isConfigured = () => true;
  async connect(config: ILiveSessionConfig, handlers: ILiveHandlers) {
    this.config = config;
    this.handlers = handlers;
    this.isOpen = true;
  }
  sendText(text: string) {
    this.texts.push(text);
  }
  sendAudio() {}
  sendToolResponses(responses: FunctionResponse[]) {
    this.toolResponses.push(...responses);
  }
  close() {
    this.isOpen = false;
  }
  /** Server sends a tool call; returns the store's response. */
  call(name: string, args: Record<string, unknown> = {}): Record<string, unknown> {
    const call: FunctionCall = { id: `call-${this.toolResponses.length}`, name, args };
    this.handlers!.onToolCalls([call]);
    return this.toolResponses.at(-1)!.response as Record<string, unknown>;
  }
}

const fakeAudio = {
  micOn: signal(false).asReadonly(),
  playing: signal(false).asReadonly(),
  unlockSpeaker: async () => {},
  startMic: async () => {},
  stopMic: () => {},
  play: () => {},
  flush: () => {},
  level: () => 0,
  dispose: () => {},
};

const fakeQuestion = (i: number): IQuestionItemPayload => ({
  type: 'MCQ',
  marks: 4,
  subject: 'Physics',
  topic: 'T',
  difficulty: 'medium',
  en: { text: `Q${i}`, options: ['opt1', 'opt2', 'opt3', 'opt4'].map((id) => ({ id, text: id })) },
  correctOptionId: 'opt1',
  explanation: 'because',
});

class FakeGenerator {
  calls = 0;
  release: (() => void) | null = null;
  hold = false;
  isConfigured = () => true;
  async generate(intake: IExamIntakeResult): Promise<IQuestionItemPayload[]> {
    this.calls++;
    if (this.hold) await new Promise<void>((r) => (this.release = r));
    return Array.from({ length: intake.examParams.targetQuestions }, (_, i) => fakeQuestion(i));
  }
}

class FakeExamApi {
  requests: { payload: ICreateCompleteExamRequest; requestId: string }[] = [];
  failNext: Error | null = null;
  async createCompleteExam(payload: ICreateCompleteExamRequest, requestId: string) {
    this.requests.push({ payload, requestId });
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    return { success: true, examId: 'exam_1', totalQuestions: payload.questions.length, totalMarks: 60, status: 'draft' as const, createdAt: 'now', studentUrl: 'http://x/student/exams/exam_1' };
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ExamIntakeStore', () => {
  let store: ExamIntakeStore;
  let live: FakeLiveClient;
  let generator: FakeGenerator;
  let api: FakeExamApi;

  beforeEach(() => {
    localStorage.clear();
    live = new FakeLiveClient();
    generator = new FakeGenerator();
    api = new FakeExamApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: GeminiLiveClient, useValue: live },
        { provide: AudioIo, useValue: fakeAudio },
        { provide: QuestionGenerator, useValue: generator },
        { provide: ExamApiService, useValue: api },
      ],
    });
    store = TestBed.inject(ExamIntakeStore);
  });

  it('connects lazily with the strict prompt and both tools, then sends the typed request', async () => {
    await store.sendText('Class 10 physics paper on linear motion');
    expect(store.status()).toBe('live');
    expect(live.config?.systemInstruction).toContain('Hard scope rules');
    expect(live.config?.tools.map((t) => t.name)).toEqual([UPDATE_DRAFT_TOOL, FINALIZE_TOOL]);
    expect(live.texts).toEqual(['Class 10 physics paper on linear motion']);
    expect(store.messages().map((m) => [m.role, m.text])).toEqual([['user', 'Class 10 physics paper on linear motion']]);
  });

  it('answers draft updates with what is still missing', async () => {
    await store.sendText('Physics paper on linear motion for Section A');
    const verdict = live.call(UPDATE_DRAFT_TOOL, { subject: 'Physics', topic: 'Linear Motion', batchId: 'batch-class10-a' });
    expect(verdict['nextStep']).toBe('ask_missing');
    expect(verdict['missing']).toEqual(['targetQuestions', 'date', 'startTime', 'duration']);
    expect(store.draft().batchId).toBe('batch-class10-a');
    expect(store.awaitingConfirmation()).toBe(false);
  });

  it('never lets the agent pick a batch from the class alone; accepts it once the teacher agrees', async () => {
    await store.sendText('Class 10 physics, linear motion');
    const guessed = live.call(UPDATE_DRAFT_TOOL, { subject: 'Physics', topic: 'Linear Motion', batchId: 'batch-class10-a' });
    expect(store.draft().batchId).toBeUndefined();
    expect(store.draft().topic).toBe('Linear Motion');
    expect(guessed['missing']).toContain('batchId');
    expect(guessed['batchNotChosen']).toContain('Class 10 – Section A');

    // Same guess again before anyone said the batch out loud: still rejected.
    live.call(UPDATE_DRAFT_TOOL, { batchId: 'batch-class10-a' });
    expect(store.draft().batchId).toBeUndefined();

    live.handlers!.onOutputTranscript('Is this for Class 10 Section A?');
    live.handlers!.onTurnComplete();
    live.handlers!.onInputTranscript('Haan, wahi');
    live.call(UPDATE_DRAFT_TOOL, { batchId: 'batch-class10-a' });
    expect(store.draft().batchId).toBe('batch-class10-a');
  });

  it('refuses to finalize until the teacher replies to the read-back, then emits the result', async () => {
    await store.sendText('NEET electrostatics test for Lakshya');
    const verdict = live.call(UPDATE_DRAFT_TOOL, {
      subject: 'Physics',
      topic: 'Electrostatics',
      batchId: 'batch-lakshya-2026',
      targetQuestions: 15,
      date: '2099-01-10',
      startTime: '10:00',
      duration: 45,
    });
    expect(verdict['nextStep']).toBe('confirm');
    expect(store.awaitingConfirmation()).toBe(true);

    // The model tries to finalize in the same turn, without the teacher confirming.
    expect(live.call(FINALIZE_TOOL)['ok']).toBe(false);
    expect(store.result()).toBeNull();

    live.handlers!.onInputTranscript('Haan, theek hai');
    expect(live.call(FINALIZE_TOOL)['ok']).toBe(true);
    expect(store.status()).toBe('complete');
    expect(store.result()?.examParams).toMatchObject({ batchId: 'batch-lakshya-2026', endTime: '10:45', targetQuestions: 15 });
  });

  it('finalize returns the missing fields when the draft is incomplete', async () => {
    await store.sendText('make a test');
    const response = live.call(FINALIZE_TOOL);
    expect(response['ok']).toBe(false);
    expect(response['missing']).toContain('topic');
  });

  it('lets the teacher confirm from the button and saves the session to history', async () => {
    await store.sendText('JEE kinematics test for the Abhimanyu batch');
    live.call(UPDATE_DRAFT_TOOL, {
      subject: 'Physics',
      topic: 'Kinematics',
      batchId: 'batch-abhimanyu-jee-2027',
      targetQuestions: 20,
      date: '2099-01-10',
      startTime: '09:00',
      duration: 45,
    });
    store.confirmFromButton();
    expect(store.result()?.examParams.examPattern).toBe('JEE Main');
    expect(live.isOpen).toBe(false);
    expect(store.sessions()[0].result?.examParams.title).toContain('Kinematics');
  });

  it('keeps a late voice transcript above the agent reply it triggered', async () => {
    await store.sendText('hello');
    live.handlers!.onTurnComplete();
    live.handlers!.onOutputTranscript('Which batch?');
    live.handlers!.onInputTranscript('Class 10');
    expect(store.messages().map((m) => m.text)).toEqual(['hello', 'Class 10', 'Which batch?']);
  });

  it('restores collected fields after a reconnect', async () => {
    await store.sendText('NEET test for Lakshya 2026');
    live.call(UPDATE_DRAFT_TOOL, { topic: 'Optics', batchId: 'batch-lakshya-2026' });
    live.isOpen = false;
    live.handlers!.onClose('network');
    expect(store.status()).toBe('error');

    await store.reconnect();
    expect(store.status()).toBe('live');
    // Restore note first, then the teacher's unanswered message.
    expect(live.texts.at(-2)).toContain('"topic":"Optics"');
    expect(live.texts.at(-1)).toBe('NEET test for Lakshya 2026');
  });

  it('starts a fresh conversation with New chat', async () => {
    await store.sendText('NEET test');
    store.newChat();
    expect(store.messages()).toEqual([]);
    expect(store.draft()).toEqual({});
    expect(store.status()).toBe('idle');
    expect(store.sessions().length).toBe(1);
  });

  it('does not count late fragments of the same utterance as confirming the read-back', async () => {
    await store.sendText('start');
    live.handlers!.onTurnComplete();
    live.handlers!.onInputTranscript('NEET Lakshya electrostatics 15 questions 2099-01-10');
    live.call(UPDATE_DRAFT_TOOL, { subject: 'Physics', topic: 'Electrostatics', batchId: 'batch-lakshya-2026', targetQuestions: 15, date: '2099-01-10', startTime: '10:00', duration: 45 });
    live.handlers!.onInputTranscript(' at 10 AM'); // transcript lagging behind the tool call
    expect(live.call(FINALIZE_TOOL)['ok']).toBe(false);

    live.handlers!.onTurnComplete();
    live.handlers!.onInputTranscript('yes');
    expect(live.call(FINALIZE_TOOL)['ok']).toBe(true);
  });

  it('drops a stale explicit end time when only the start time changes', async () => {
    await store.sendText('Lakshya test');
    live.call(UPDATE_DRAFT_TOOL, { startTime: '10:00', endTime: '11:00', duration: 45 });
    live.call(UPDATE_DRAFT_TOOL, { startTime: '09:00' });
    expect(store.draft().endTime).toBeUndefined();
    expect(store.evaluation().examParams.endTime).toBe('09:45');
  });

  it('keeps the teacher talking over the agent in one bubble', async () => {
    await store.sendText('hi');
    live.handlers!.onTurnComplete();
    live.handlers!.onOutputTranscript('Which batch is');
    live.handlers!.onInputTranscript('Lakshya');
    live.handlers!.onInterrupted();
    live.handlers!.onInputTranscript(' 2026');
    expect(store.messages().filter((m) => m.role === 'user').map((m) => m.text)).toEqual(['hi', 'Lakshya 2026']);
  });

  it('re-sends the unanswered message after reconnecting', async () => {
    await store.sendText('Lakshya NEET test');
    live.isOpen = false;
    live.handlers!.onClose('network');
    await store.reconnect();
    expect(live.texts.at(-1)).toBe('Lakshya NEET test');
  });

  it('answers draft updates silently while the agent is already speaking, unless something needs correcting', async () => {
    await store.sendText('Lakshya NEET physics test');
    live.handlers!.onTurnComplete();
    const scheduling = () => live.toolResponses.at(-1)!.scheduling;

    live.call(UPDATE_DRAFT_TOOL, { topic: 'Optics' });
    expect(scheduling()).toBe('WHEN_IDLE'); // agent has not spoken yet this turn

    live.handlers!.onAudio('AAAA');
    live.call(UPDATE_DRAFT_TOOL, { subject: 'Physics' });
    expect(scheduling()).toBe('SILENT');

    live.call(UPDATE_DRAFT_TOOL, { duration: 1 });
    expect(scheduling()).toBe('WHEN_IDLE'); // invalid value must be corrected aloud

    live.call(UPDATE_DRAFT_TOOL, { batchId: 'batch-class10-a' });
    expect(scheduling()).toBe('WHEN_IDLE'); // batch the teacher never chose
  });

  it('deletes a past session, and deleting the open chat starts a fresh one', async () => {
    await store.sendText('first Lakshya test');
    store.newChat();
    const pastId = store.sessions()[0].id;
    await store.sendText('second chat');
    store.openSession(pastId);
    store.deleteSession(pastId);
    expect(store.sessions().some((s) => s.id === pastId)).toBe(false);
    expect(store.viewing()).toBeNull();
    expect(store.messages()).toEqual([]);
    // The chat we left by opening the past one is still in history.
    expect(store.sessions().map((s) => s.title)).toEqual(['second chat']);
  });

  async function confirmJeeExam() {
    await store.sendText('JEE kinematics test for the Abhimanyu batch');
    live.call(UPDATE_DRAFT_TOOL, { subject: 'Physics', topic: 'Kinematics', batchId: 'batch-abhimanyu-jee-2027', targetQuestions: 12, date: '2099-01-10', startTime: '09:00', duration: 45 });
    store.confirmFromButton();
  }

  it('after confirmation, generates the questions and creates the exam via create-complete', async () => {
    generator.hold = true;
    await confirmJeeExam();
    expect(store.creation().phase).toBe('generating');
    generator.release!();
    await flush();
    expect(store.creation().phase).toBe('created');
    expect(store.creation().exam?.examId).toBe('exam_1');
    const { payload, requestId } = api.requests[0];
    expect(payload.questions.length).toBe(12);
    expect(payload.examParams).toMatchObject({ batchId: 'batch-abhimanyu-jee-2027', targetQuestions: 12, examPattern: 'JEE Main' });
    expect(requestId).toMatch(/[0-9a-f-]{36}/);
    expect(store.sessions()[0].createdExam?.examId).toBe('exam_1');
  });

  it('on failure shows the error; Retry re-posts the same questions with the same request id', async () => {
    api.failNext = new ExamApiError('HTTP 404: Not Found. The create-complete endpoint is not deployed yet.', 'HTTP_404', 404);
    await confirmJeeExam();
    await flush();
    expect(store.creation()).toMatchObject({ phase: 'failed', error: expect.stringContaining('not deployed') });

    await store.createExam();
    expect(store.creation().phase).toBe('created');
    expect(generator.calls).toBe(1);
    expect(api.requests.length).toBe(2);
    expect(api.requests[1].requestId).toBe(api.requests[0].requestId);
    expect(api.requests[1].payload.questions).toBe(api.requests[0].payload.questions);
  });

  it('explains an idempotency conflict instead of offering a blind retry message', async () => {
    api.failNext = new ExamApiError('in progress', 'IDEMPOTENCY_CONFLICT', 409);
    await confirmJeeExam();
    await flush();
    expect(store.creation().error).toContain('already submitted');
  });

  it('abandons a creation run when the teacher starts a new chat meanwhile', async () => {
    generator.hold = true;
    await confirmJeeExam();
    store.newChat();
    generator.release!();
    await flush();
    expect(store.creation().phase).toBe('idle');
    expect(api.requests.length).toBe(0);
  });
});
