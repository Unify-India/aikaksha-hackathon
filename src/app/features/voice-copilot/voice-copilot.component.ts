import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ChatSidebarComponent } from './components/chat-sidebar.component';
import { ChatThreadComponent } from './components/chat-thread.component';
import { ExamParamsCardComponent } from './components/exam-params-card.component';
import { SuggestionChipsComponent } from './components/suggestion-chips.component';
import { VoiceComposerComponent } from './components/voice-composer.component';
import { ExamIntakeStore } from './data/exam-intake.store';
import { REQUIRED_FIELDS } from './data/exam-params.rules';
import { TEACHER_BATCHES, TEACHER_NAME } from './data/teacher-context';

/**
 * Voice Copilot: a Gemini-style voice chat that collects exam parameters
 * (`IExamParamsPayload` + generation hints) and emits them as JSON.
 */
@Component({
  selector: 'app-voice-copilot',
  imports: [NgTemplateOutlet, ChatSidebarComponent, ChatThreadComponent, ExamParamsCardComponent, SuggestionChipsComponent, VoiceComposerComponent],
  template: `
    <div
      class="relative flex h-[calc(100dvh-10.5rem)] min-h-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <!-- History: always visible on md+, a drawer on small screens -->
      <app-chat-sidebar
        class="hidden md:flex"
        [sessions]="store.sessions()"
        [activeId]="store.activeSessionId()"
        (newChat)="store.newChat()"
        (open)="store.openSession($event)"
        (remove)="store.deleteSession($event)"
      />
      @if (drawerOpen()) {
        <div class="absolute inset-0 z-20 flex md:hidden">
          <app-chat-sidebar
            class="shadow-xl"
            [sessions]="store.sessions()"
            [activeId]="store.activeSessionId()"
            (newChat)="store.newChat(); drawerOpen.set(false)"
            (open)="store.openSession($event); drawerOpen.set(false)"
            (remove)="store.deleteSession($event)"
          />
          <button type="button" class="flex-1 bg-slate-950/40" aria-label="Close history" (click)="drawerOpen.set(false)"></button>
        </div>
      }

      <section class="flex min-w-0 flex-1 flex-col" aria-labelledby="copilot-heading">
        <!-- Top strip: history toggle (mobile), live status, progress -->
        <div class="flex h-12 shrink-0 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 md:hidden dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Show history"
            (click)="drawerOpen.set(true)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 id="copilot-heading" class="text-sm font-semibold text-slate-800 dark:text-slate-100">Voice Copilot</h1>
          <span class="ml-auto flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            @if (progress(); as p) {
              <span>{{ p.done }}/{{ p.total }} details collected</span>
            }
            <span class="flex items-center gap-1.5" role="status">
              <span class="h-2 w-2 rounded-full" [class]="statusDot()" aria-hidden="true"></span>
              {{ statusLabel() }}
            </span>
          </span>
        </div>

        @if (store.viewing()) {
          <div class="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span>Viewing a past conversation (read-only).</span>
            <button type="button" class="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-amber-600" (click)="store.newChat()">
              Start a new chat
            </button>
          </div>
        }

        @if (!store.started()) {
          <!-- Empty state, Gemini style -->
          <div class="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <div class="w-full max-w-2xl">
              <p class="mb-2 text-center text-lg font-medium text-slate-600 dark:text-slate-400">Namaste, {{ teacherName }}</p>
              <h2 class="mb-8 text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                Which exam should we set up?
              </h2>
              <app-voice-composer
                [micOn]="store.micOn()"
                [agentSpeaking]="store.agentSpeaking()"
                [micSupported]="store.micSupported"
                [disabled]="composerDisabled()"
                (send)="store.sendText($event)"
                (toggleMic)="store.toggleMic()"
              />
              <p class="mt-3 text-center text-sm text-slate-600 dark:text-slate-400">
                Tap the mic and speak in English, Hindi or Hinglish, or type. Try one of these:
              </p>
              <div class="mt-4">
                <app-suggestion-chips [disabled]="composerDisabled()" (pick)="store.sendText($event)" />
              </div>
              <ng-container *ngTemplateOutlet="alerts" />
            </div>
          </div>
        } @else {
          <app-chat-thread [messages]="store.visibleMessages()">
            @if (showCard()) {
              <li class="pl-11">
                <app-exam-params-card
                  [evaluation]="store.visibleEvaluation()"
                  [result]="store.visibleResult()"
                  [creation]="store.visibleCreation()"
                  [readonly]="!!store.viewing()"
                  (confirm)="store.confirmFromButton()"
                  (retry)="store.createExam()"
                />
              </li>
            }
          </app-chat-thread>

          <div class="shrink-0 px-4 pb-4 pt-2">
            <div class="mx-auto max-w-3xl">
              <ng-container *ngTemplateOutlet="alerts" />
              @if (askingBatch()) {
                <div class="mb-3 flex flex-wrap items-center gap-2" role="group" aria-labelledby="batch-pick-label">
                  <span id="batch-pick-label" class="text-sm text-slate-600 dark:text-slate-400">Pick a batch:</span>
                  @for (b of batches; track b.id) {
                    <button
                      type="button"
                      (click)="store.sendText(b.name + ' (' + b.classLevel + ', ' + b.examPattern + ')')"
                      class="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm text-slate-800 transition hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      {{ b.name }} <span class="text-slate-600 dark:text-slate-400">· {{ b.classLevel }}</span>
                    </button>
                  }
                </div>
              }
              @if (store.result() && !store.viewing()) {
                <div class="flex justify-center">
                  <button
                    type="button"
                    (click)="store.newChat()"
                    class="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    Set up another exam
                  </button>
                </div>
              } @else {
                <app-voice-composer
                  [micOn]="store.micOn()"
                  [agentSpeaking]="store.agentSpeaking()"
                  [micSupported]="store.micSupported"
                  [disabled]="composerDisabled()"
                  placeholder="Reply to AI Kaksha"
                  (send)="store.sendText($event)"
                  (toggleMic)="store.toggleMic()"
                />
              }
            </div>
          </div>
        }
      </section>
    </div>

    <ng-template #alerts>
      @if (store.error(); as error) {
        <div role="alert" class="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <span>{{ error }}</span>
          @if (store.configured) {
            <button type="button" class="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-rose-600" (click)="store.reconnect()">
              Reconnect
            </button>
          }
        </div>
      }
      @if (store.notice(); as notice) {
        <p role="status" class="mb-3 mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{{ notice }}</p>
      }
    </ng-template>
  `,
})
export class VoiceCopilotComponent {
  protected readonly store = inject(ExamIntakeStore);
  protected readonly teacherName = TEACHER_NAME;
  protected readonly batches = TEACHER_BATCHES;
  protected readonly drawerOpen = signal(false);

  protected readonly composerDisabled = computed(
    () => !!this.store.viewing() || this.store.status() === 'connecting' || this.store.status() === 'complete',
  );
  /** The batch is the one field the agent must never pick itself, so offer one-tap answers while it is missing. */
  protected readonly askingBatch = computed(
    () =>
      this.store.status() === 'live' &&
      !this.store.viewing() &&
      this.store.evaluation().missing.includes('batchId') &&
      this.store.messages().some((m) => m.role === 'agent' && m.text.trim()),
  );
  protected readonly showCard = computed(() => !!this.store.visibleResult() || this.store.awaitingConfirmation());

  protected readonly progress = computed(() => {
    if (this.store.viewing() || !this.store.started()) return null;
    const missing = this.store.evaluation().missing.length;
    return { done: REQUIRED_FIELDS.length - missing, total: REQUIRED_FIELDS.length };
  });

  protected readonly statusLabel = computed(() => {
    if (this.store.viewing()) return 'Read-only';
    switch (this.store.status()) {
      case 'connecting':
        return 'Connecting…';
      case 'live':
        return this.store.agentSpeaking() ? 'Speaking…' : this.store.micOn() ? 'Listening…' : 'Connected';
      case 'complete':
        return 'Done';
      case 'error':
        return 'Disconnected';
      default:
        return 'Ready';
    }
  });

  protected readonly statusDot = computed(() => {
    switch (this.store.status()) {
      case 'live':
        return this.store.micOn() ? 'bg-rose-500' : 'bg-emerald-500';
      case 'connecting':
        return 'bg-amber-500';
      case 'complete':
        return 'bg-indigo-500';
      case 'error':
        return 'bg-rose-700';
      default:
        return 'bg-slate-400';
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.store.suspend());
  }
}
