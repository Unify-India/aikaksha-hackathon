import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';

@Component({
  selector: 'app-evaluation-audit-bar',
  standalone: true,
  imports: [CommonModule, AppButtonComponent, StatusBadgeComponent],
  template: `
    <div class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <!-- Student & Integrity Status -->
        <div class="flex items-center gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-lg font-bold">
            🎓
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-slate-900 dark:text-white">
                Roll: {{ studentRoll() }} &bull; {{ studentName() }}
              </span>
              <app-status-badge
                [label]="checksumVerified() ? 'SHA-256 VERIFIED' : 'TAMPER WARNING'"
                [variant]="checksumVerified() ? 'success' : 'danger'"
              />
            </div>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span class="truncate max-w-xs select-all" [title]="imageChecksum()">
                Checksum: {{ imageChecksum() }}
              </span>
              <span>&bull;</span>
              <span>Non-Destructive SVG Overlay</span>
            </div>
          </div>
        </div>

        <!-- Metrics & Human Gate Button -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Model Evaluation Confidence -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">AI Confidence</span>
            <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {{ (confidenceScore() * 100).toFixed(1) }}%
            </span>
          </div>

          <!-- Total Score Pill -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">Evaluated Score</span>
            <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {{ awardedMarks() }} / {{ maxMarks() }} pts
            </span>
          </div>

          <!-- Navigation & Approval Gate Action -->
          <div class="flex items-center gap-2 pl-2">
            <app-button
              variant="secondary"
              size="sm"
              label="Previous Sheet"
              [disabled]="isFirstSheet()"
              (clicked)="previousSheet.emit()"
            />
            <app-button
              variant="accent"
              icon="✅"
              size="md"
              label="Approve & Next Sheet"
              (clicked)="approveAndNext.emit()"
            />
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EvaluationAuditBarComponent {
  public studentRoll = input<string>('2026-NEET-042');
  public studentName = input<string>('Aarav Verma');
  public imageChecksum = input<string>('sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
  public checksumVerified = input<boolean>(true);
  public confidenceScore = input<number>(0.964);
  public awardedMarks = input<number>(18);
  public maxMarks = input<number>(20);
  public isFirstSheet = input<boolean>(false);

  public previousSheet = output<void>();
  public approveAndNext = output<void>();
}
