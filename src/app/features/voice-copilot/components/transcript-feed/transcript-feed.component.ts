import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IAgentTranscriptStep, IMCPToolCall } from '../../../../shared/models/voice-agent.model';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';

@Component({
  selector: 'app-transcript-feed',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent],
  template: `
    <div class="flex flex-col h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">Conversational Transcript & MCP Telemetry</h2>
          <p class="text-xs text-slate-500">Live multi-turn reasoning logs between Teacher & Autonomous Agent</p>
        </div>
        <span class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Stream Active
        </span>
      </div>

      <!-- Feed Container -->
      <div class="mt-4 flex-1 space-y-3.5 overflow-y-auto max-h-[460px] pr-1.5 scrollbar-thin">
        @for (step of steps(); track step.id) {
          <!-- Teacher / User Speech -->
          @if (step.sender === 'user') {
            <div class="flex items-start gap-3 justify-end pl-8">
              <div class="flex flex-col items-end">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[11px] text-slate-400">{{ formatTimestamp(step.timestamp) }}</span>
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Teacher (You)</span>
                </div>
                <div class="rounded-2xl rounded-tr-xs bg-indigo-600 px-4 py-2.5 text-xs text-white shadow-xs">
                  {{ step.text }}
                </div>
              </div>
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                👨‍🏫
              </div>
            </div>
          }

          <!-- Agent / Gemini Reasoning -->
          @if (step.sender === 'agent') {
            <div class="flex items-start gap-3 pr-8">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-xs">
                ✨
              </div>
              <div class="flex flex-col items-start">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-bold text-slate-900 dark:text-white">AI Kaksha Copilot</span>
                  <span class="rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">Gemini 2.5</span>
                  <span class="text-[11px] text-slate-400">{{ formatTimestamp(step.timestamp) }}</span>
                </div>
                <div class="rounded-2xl rounded-tl-xs border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-800 shadow-2xs dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                  {{ step.text }}
                </div>
              </div>
            </div>
          }

          <!-- System / MCP Tool Execution Log -->
          @if (step.sender === 'system' || step.toolCall) {
            <div class="my-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-[10px] text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    ⚙️
                  </span>
                  <span class="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    {{ step.toolCall?.name || 'mcp_tool_execution' }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  @if (step.toolCall?.executionDurationMs) {
                    <span class="font-mono text-[10px] text-slate-400">{{ step.toolCall?.executionDurationMs }}ms</span>
                  }
                  <app-status-badge
                    [label]="step.toolCall?.status || 'success'"
                    [variant]="step.toolCall?.status === 'success' ? 'success' : 'info'"
                  />
                </div>
              </div>

              @if (step.toolCall?.parameters) {
                <div class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-2 text-[11px] font-mono text-indigo-200">
                  <span class="text-slate-500">// Parameters</span>
                  <pre class="mt-0.5 whitespace-pre-wrap">{{ step.toolCall?.parameters | json }}</pre>
                </div>
              }
            </div>
          }
        }
      </div>

      <!-- Footer Info -->
      <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Protocol: MCP Stdio / SSE Transport</span>
        <span>Zero Latency Loop</span>
      </div>
    </div>
  `,
})
export class TranscriptFeedComponent {
  public steps = input<IAgentTranscriptStep[]>([]);
  public toolSelected = output<IMCPToolCall>();

  public formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
