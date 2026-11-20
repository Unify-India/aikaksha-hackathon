import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import { AudioVisualizerComponent } from './components/audio-visualizer/audio-visualizer.component';
import { IntentCardComponent } from './components/intent-card/intent-card.component';
import { TranscriptFeedComponent } from './components/transcript-feed/transcript-feed.component';
import { IVoiceIntent, IAgentTranscriptStep } from '../../shared/models/voice-agent.model';
import { NegativeMarkingRule, QuestionType } from '../../core/config/app.constants';

@Component({
  selector: 'app-voice-copilot',
  standalone: true,
  imports: [
    CommonModule,
    StatCardComponent,
    AppButtonComponent,
    AudioVisualizerComponent,
    IntentCardComponent,
    TranscriptFeedComponent,
  ],
  template: `
    <div class="space-y-6">
      <!-- Header Banner -->
      <div
        class="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between border border-indigo-800/50"
      >
        <div>
          <div class="flex items-center gap-2">
            <span
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30"
            >
              Autonomous Copilot
            </span>
            <span class="text-xs font-medium text-indigo-300">Gemini 2.5 Flash + MCP Protocol</span>
          </div>
          <h1 class="mt-2 text-2xl font-extrabold tracking-tight">Voice Intake & Autonomous Exam Copilot</h1>
          <p class="mt-1 text-sm text-indigo-200 max-w-2xl leading-relaxed">
            Speak natural voice instructions or test voice intents to auto-generate verified practice exams and sync with teacher review gate.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <app-button
            [variant]="isListening() ? 'danger' : 'primary'"
            size="lg"
            [icon]="isListening() ? '⏹️' : '🎙️'"
            [label]="isListening() ? 'Stop Recording' : 'Speak Prompt'"
            (clicked)="toggleListening()"
          />
          <app-button
            variant="secondary"
            size="lg"
            icon="✨"
            label="Load NEET Prompt"
            (clicked)="loadNeetSamplePrompt()"
          />
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Copilot Mode" [value]="mcpMode()" subtitle="MCP Tool Execution" icon="⚡" />
        <app-stat-card title="Parsed Intent" [value]="activeIntent()?.detectedAction ?? 'IDLE'" subtitle="Intent Confidence 98%" icon="🎯" />
        <app-stat-card title="Target Batch" [value]="activeIntent()?.extractedSlots?.batchName ?? 'None'" subtitle="Resolved Context" icon="👥" />
        <app-stat-card title="Scheduled Window" [value]="scheduleSummary()" subtitle="Calculated Epoch Window" icon="⏱️" />
      </div>

      <!-- Two-Column POC Layout: Visualizer & Intent on Left, Telemetry Transcript on Right -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Left: Audio Visualizer + Intent Extraction Card -->
        <div class="space-y-6 lg:col-span-7">
          <app-audio-visualizer
            [isListening]="isListening()"
            [waveformBars]="waveformBars()"
            (toggleListening)="toggleListening()"
            (samplePromptRequested)="loadNeetSamplePrompt()"
          />

          <app-intent-card
            [intent]="activeIntent()"
            (planAccepted)="onPlanAccepted()"
            (reparseRequested)="onReparseRequested()"
            (slotSelected)="onSlotSelected($event)"
          />
        </div>

        <!-- Right: Transcript Feed & MCP Telemetry -->
        <div class="space-y-6 lg:col-span-5">
          <app-transcript-feed [steps]="transcriptSteps()" />
        </div>
      </div>
    </div>
  `,
})
export class VoiceCopilotComponent {
  public isListening = signal<boolean>(false);
  public mcpMode = signal<string>('MCP STDIO / TOOL-CALL');
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

  public transcriptSteps = signal<IAgentTranscriptStep[]>([
    {
      id: 'step-01',
      timestamp: Date.now() - 45000,
      sender: 'user',
      text: 'Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.',
    },
    {
      id: 'step-02',
      timestamp: Date.now() - 38000,
      sender: 'agent',
      text: 'Understood. Analyzing speech intent and resolving teacher institute context for Batch Lakshya 2026...',
    },
    {
      id: 'step-03',
      timestamp: Date.now() - 32000,
      sender: 'system',
      text: 'Tool execution resolved teacher permissions and active batches.',
      toolCall: {
        callId: 'call-01',
        name: 'resolve_teacher_context',
        parameters: { teacherId: 'teacher-sharma-101', instituteId: 'inst-alpha-delhi' },
        status: 'success',
        executionDurationMs: 140,
      },
    },
    {
      id: 'step-04',
      timestamp: Date.now() - 25000,
      sender: 'system',
      text: 'Creating draft exam shell with time-lock epoch boundaries.',
      toolCall: {
        callId: 'call-02',
        name: 'create_exam',
        parameters: {
          title: 'NEET Practice: Electrostatics DPP',
          batchId: 'batch-lakshya-2026',
          duration: 45,
          targetQuestions: 15,
          defaultMarks: 4,
          negativeRule: 'one_quarter',
        },
        status: 'success',
        executionDurationMs: 280,
      },
    },
    {
      id: 'step-05',
      timestamp: Date.now() - 10000,
      sender: 'agent',
      text: '15 verified Electrostatics MCQs generated with LaTeX mathematical formulas and teacher explanations. Ready for Review Gate inspection.',
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

  public onPlanAccepted(): void {
    alert('Plan accepted! Questions queued for teacher Review Gate.');
  }

  public onReparseRequested(): void {
    this.isListening.set(true);
  }

  public onSlotSelected(slot: string): void {
    console.log('Resolving slot:', slot);
  }
}
