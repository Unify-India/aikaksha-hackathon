import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import {
  AnswerSheetViewerComponent,
  IAnnotationMarker,
} from './components/answer-sheet-viewer/answer-sheet-viewer.component';
import {
  RubricScorePanelComponent,
  IRubricItem,
} from './components/rubric-score-panel/rubric-score-panel.component';
import { EvaluationAuditBarComponent } from './components/evaluation-audit-bar/evaluation-audit-bar.component';

@Component({
  selector: 'app-evaluation-cockpit',
  standalone: true,
  imports: [
    CommonModule,
    StatCardComponent,
    AnswerSheetViewerComponent,
    RubricScorePanelComponent,
    EvaluationAuditBarComponent,
  ],
  template: `
    <div class="space-y-6">
      <!-- Evaluation Audit Bar Component -->
      <app-evaluation-audit-bar
        [studentRoll]="currentStudentRoll()"
        [studentName]="currentStudentName()"
        [imageChecksum]="submissionChecksum()"
        [checksumVerified]="isChecksumVerified()"
        [confidenceScore]="aiConfidence()"
        [awardedMarks]="totalAwardedScore()"
        [maxMarks]="totalMaxScore()"
        [isFirstSheet]="isFirst()"
        (previousSheet)="handlePreviousSheet()"
        (approveAndNext)="handleApproveAndNext()"
      />

      <!-- Quick Metrics Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Student Roll" [value]="currentStudentRoll()" [subtitle]="currentStudentName()" icon="👤" />
        <app-stat-card
          title="Provisional Score"
          [value]="scoreSummary()"
          subtitle="AI Step-Marking"
          icon="📊"
        />
        <app-stat-card title="Handwriting OCR" value="96.4%" subtitle="High Confidence" icon="✍️" />
        <app-stat-card title="Integrity Check" value="Zero Overwrite" subtitle="Non-destructive Overlay" icon="🛡️" />
      </div>

      <!-- Main Workspace: Visual Answer Sheet Canvas on Left, Rubric Scoring on Right -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Visual Answer Sheet + Non-Destructive Red-Pen Overlay -->
        <div class="space-y-4 lg:col-span-7">
          <app-answer-sheet-viewer
            [annotations]="annotations()"
            (markerClicked)="handleMarkerClicked($event)"
          />
        </div>

        <!-- Step-by-Step Rubrics & Teacher Overrides Panel -->
        <div class="space-y-4 lg:col-span-5">
          <app-rubric-score-panel
            [rubrics]="rubrics()"
            (scoreOverridden)="onRubricOverridden($event)"
            (resetRequested)="onResetRubrics()"
          />
        </div>
      </div>
    </div>
  `,
})
export class EvaluationCockpitComponent {
  public currentStudentRoll = signal<string>('2026-NEET-042');
  public currentStudentName = signal<string>('Aarav Verma');
  public submissionChecksum = signal<string>('sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
  public isChecksumVerified = signal<boolean>(true);
  public aiConfidence = signal<number>(0.964);
  public isFirst = signal<boolean>(true);

  public annotations = signal<IAnnotationMarker[]>([
    {
      id: 'anno-1',
      xPercent: 78,
      yPercent: 30,
      type: 'correct',
      stepTitle: 'Step 2: Surface Charge',
      comment: 'Accurately formulated sigma = Q/A.',
      marksAwarded: 1,
    },
    {
      id: 'anno-2',
      xPercent: 72,
      yPercent: 55,
      type: 'correct',
      stepTitle: 'Step 5: Potential Integral',
      comment: 'Valid separation of vacuum vs dielectric potential.',
      marksAwarded: 2,
    },
    {
      id: 'anno-3',
      xPercent: 68,
      yPercent: 78,
      type: 'correct',
      stepTitle: 'Step 6: Final Formula & Case',
      comment: 'Both general formula and t=d special case verified.',
      marksAwarded: 2,
    },
  ]);

  public rubrics = signal<IRubricItem[]>([
    {
      id: 'step-1',
      stepNumber: 1,
      criterion: 'Gauss Law Formulation & Surface Charge Density',
      modelAnswerSnippet: 'sigma = Q / A ; E_0 = sigma / epsilon_0 = Q / (A * epsilon_0)',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Surface charge correctly stated with appropriate units and polarity.',
      confidence: 0.98,
    },
    {
      id: 'step-2',
      stepNumber: 2,
      criterion: 'Potential Integral with Dielectric Slab (t thickness)',
      modelAnswerSnippet: 'V = E_0 * (d - t) + (E_0 / K) * t',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Proper piecewise line integral of electric field across thickness boundaries.',
      confidence: 0.94,
    },
    {
      id: 'step-3',
      stepNumber: 3,
      criterion: 'Final Capacitance Expression & Special Case (t = d)',
      modelAnswerSnippet: 'C = epsilon_0 * A / (d - t*(1 - 1/K)) ; When t=d => C = K * epsilon_0 * A / d',
      maxMarks: 1,
      awardedMarks: 1,
      reasoning: 'Both general algebraic result and special case cleanly evaluated.',
      confidence: 0.99,
    },
  ]);

  public totalAwardedScore(): number {
    return this.rubrics().reduce((acc, curr) => acc + curr.awardedMarks, 0);
  }

  public totalMaxScore(): number {
    return this.rubrics().reduce((acc, curr) => acc + curr.maxMarks, 0);
  }

  public scoreSummary(): string {
    return `${this.totalAwardedScore()} / ${this.totalMaxScore()} (${((this.totalAwardedScore() / this.totalMaxScore()) * 100).toFixed(0)}%)`;
  }

  public handlePreviousSheet(): void {
    alert('Navigating to previous student answer sheet.');
  }

  public handleApproveAndNext(): void {
    alert(`Scores for ${this.currentStudentName()} (${this.totalAwardedScore()} pts) approved and committed to gradebook. Loading next student...`);
  }

  public handleMarkerClicked(marker: IAnnotationMarker): void {
    console.log('Marker clicked:', marker);
  }

  public onRubricOverridden(event: { id: string; marks: number }): void {
    this.rubrics.update((list) =>
      list.map((r) =>
        r.id === event.id ? { ...r, awardedMarks: event.marks, isOverridden: true } : r
      )
    );
  }

  public onResetRubrics(): void {
    this.rubrics.update((list) =>
      list.map((r) => ({ ...r, awardedMarks: r.maxMarks, isOverridden: false }))
    );
  }
}
