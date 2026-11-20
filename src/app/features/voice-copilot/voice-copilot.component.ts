import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { IVoiceIntent, IMCPToolCall, IAgentTranscriptStep } from '../../shared/models/voice-agent.model';
import { NegativeMarkingRule, QuestionType } from '../../core/config/app.constants';

@Component({
  selector: 'app-voice-copilot',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, StatCardComponent],
  template: `
    <div class="space-y-6">
      <!-- Header Banner -->
      <div class="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              Autonomous Copilot
            </span>
            <span class="text-xs text-indigo-300">Gemini 2.5 Flash + MCP Protocol</span>
          </div>
          <h1 class="mt-2 text-2xl font-bold tracking-tight">Voice Intake & Autonomous Exam Copilot</h1>
          <p class="mt-1 text-sm text-indigo-200">
            Speak natural voice instructions or test voice intents to auto-generate verified practice exams and sync with teacher review gate.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            (click)="toggleListening()"
            [class]="isListening() ? 'bg-rose-600 hover:bg-rose-500 ring-4 ring-rose-400/30' : 'bg-indigo-600 hover:bg-indigo-500'"
            class="flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-sm transition-all cursor-pointer"
          >
            <span class="relative flex h-3 w-3">
              @if (isListening()) {
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
              }
              <span [class]="isListening() ? 'bg-white' : 'bg-indigo-300'" class="relative inline-flex h-3 w-3 rounded-full"></span>
            </span>
            {{ isListening() ? 'Stop Recording' : 'Speak Prompt' }}
          </button>
          <button
            (click)="loadNeetSamplePrompt()"
            class="rounded-xl border border-indigo-400/40 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20 transition cursor-pointer"
          >
            Load NEET Prompt
          </button>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Copilot Mode" [value]="mcpMode()" subtitle="MCP Tool Execution" icon="⚡" />
        <app-stat-card title="Parsed Intent" [value]="activeIntent()?.detectedAction ?? 'IDLE'" subtitle="Intent Confidence 98%" icon="🎯" />
        <app-stat-card title="Target Batch" [value]="activeIntent()?.extractedSlots?.batchName ?? 'None'" subtitle="Resolved Context" icon="👥" />
        <app-stat-card title="Scheduled Window" [value]="scheduleSummary()" subtitle="Calculated Epoch Window" icon="⏱️" />
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Left: Audio Waveform & Extracted Slots -->
        <div class="space-y-6 lg:col-span-7">
          <!-- Real-Time Waveform Simulator -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-200">Real-Time Waveform & Voice Spectrum</span>
                <app-status-badge [label]="isListening() ? 'RECORDING' : 'READY'" [variant]="isListening() ? 'danger' : 'info'" />
              </div>
              <span class="text-xs text-slate-400">16kHz PCM Stream</span>
            </div>
            
            <div class="mt-4 flex h-20 items-center justify-center gap-1 rounded-lg bg-slate-950 p-3">
              @for (bar of waveformBars(); track $index) {
                <div
                  [style.height.%]="bar"
                  [class]="isListening() ? 'bg-indigo-400' : 'bg-slate-700'"
                  class="w-1.5 rounded-full transition-all duration-100"
                ></div>
              }
            </div>

            <div class="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <span class="font-semibold text-slate-800 dark:text-slate-200">Current Transcript:</span>
              <p class="mt-1 font-mono italic">{{ currentTranscript() }}</p>
            </div>
          </div>

          <!-- Parameter Slots Card -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="text-base font-semibold text-slate-900 dark:text-white">Normalized Parameter Slots</h2>
            <p class="text-xs text-slate-500">Autonomous extraction from voice instructions via Gemini structured output.</p>

            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span class="text-xs text-slate-400">Target Batch</span>
                <p class="font-semibold text-slate-800 dark:text-slate-200">{{ activeIntent()?.extractedSlots?.batchName || '—' }}</p>
              </div>
              <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span class="text-xs text-slate-400">Subject & Topic</span>
                <p class="font-semibold text-slate-800 dark:text-slate-200">
                  {{ activeIntent()?.extractedSlots?.subject || '—' }} &bull; {{ activeIntent()?.extractedSlots?.topic || '—' }}
                </p>
              </div>
              <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span class="text-xs text-slate-400">Questions & Marks</span>
                <p class="font-semibold text-slate-800 dark:text-slate-200">
                  {{ activeIntent()?.extractedSlots?.questionCount ?? 0 }} Questions ({{ activeIntent()?.extractedSlots?.marksPerQuestion ?? 0 }} marks each)
                </p>
              </div>
              <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span class="text-xs text-slate-400">Negative Rule</span>
                <p class="font-semibold text-slate-800 dark:text-slate-200">{{ activeIntent()?.extractedSlots?.negativeRule || 'none' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: MCP Tool Execution Stream -->
        <div class="space-y-6 lg:col-span-5">
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 class="text-base font-semibold text-slate-900 dark:text-white">MCP Tool Invocations</h2>
              <span class="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Live Telemetry</span>
            </div>

            <div class="mt-4 space-y-3">
              @for (tool of recentTools(); track tool.callId) {
                <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{{ tool.name }}</span>
                    <app-status-badge [label]="tool.status" [variant]="tool.status === 'success' ? 'success' : 'info'" />
                  </div>
                  <pre class="mt-2 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">{{ tool.parameters | json }}</pre>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class VoiceCopilotComponent {
  public isListening = signal<boolean>(false);
  public mcpMode = signal<string>('MOCK / SANDBOX');
  public currentTranscript = signal<string>(
    '“Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.”'
  );

  public activeIntent = signal<IVoiceIntent | null>({
    rawTranscript:
      'Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.',
    detectedAction: 'CREATE_EXAM',
    confidence: 0.98,
    extractedSlots: {
      title: 'NEET Practice: Electrostatics DPP',
      batchName: 'Batch Lakshya 2026',
      batchId: 'batch-lakshya-2026',
      subject: 'Physics',
      topic: 'Electrostatics',
      questionCount: 15,
      durationMinutes: 45,
      marksPerQuestion: 4,
      negativeRule: NegativeMarkingRule.OneQuarter,
      questionType: QuestionType.MCQ,
      difficulty: 'medium',
      scheduledDate: '2026-11-21',
      startTime: '10:00',
      endTime: '10:45',
      examPattern: 'NEET',
    },
    missingRequiredSlots: [],
    isComplete: true,
  });

  public waveformBars = signal<number[]>([25, 40, 75, 90, 60, 30, 85, 95, 45, 65, 80, 50, 35, 70, 90, 40, 20]);

  public recentTools = signal<IMCPToolCall[]>([
    {
      callId: 'call-01',
      name: 'resolve_teacher_context',
      parameters: { teacherId: 'teacher-sharma-101' },
      status: 'success',
      executionDurationMs: 120,
    },
    {
      callId: 'call-02',
      name: 'create_exam',
      parameters: {
        title: 'NEET Practice: Electrostatics DPP',
        batchId: 'batch-lakshya-2026',
        duration: 45,
        targetQuestions: 15,
      },
      status: 'success',
      executionDurationMs: 240,
    },
    {
      callId: 'call-03',
      name: 'generate_and_attach_questions',
      parameters: {
        examId: 'exam-elec-401',
        topic: 'Electrostatics',
        count: 15,
        difficulty: 'medium',
      },
      status: 'success',
      executionDurationMs: 1450,
    },
  ]);

  public scheduleSummary = computed(() => {
    const slots = this.activeIntent()?.extractedSlots;
    if (!slots?.startTime || !slots?.endTime) return 'Tomorrow 10:00 - 10:45';
    return `${slots.scheduledDate ?? 'Tomorrow'} ${slots.startTime} - ${slots.endTime}`;
  });

  public toggleListening(): void {
    this.isListening.update((val) => !val);
  }

  public loadNeetSamplePrompt(): void {
    this.currentTranscript.set(
      '“Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.”'
    );
  }
}
