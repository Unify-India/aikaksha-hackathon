import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';

export interface IAnnotationMarker {
  id: string;
  xPercent: number;
  yPercent: number;
  type: 'correct' | 'partial' | 'wrong' | 'comment';
  stepTitle: string;
  comment: string;
  marksAwarded: number;
}

@Component({
  selector: 'app-answer-sheet-viewer',
  standalone: true,
  imports: [CommonModule, AppButtonComponent, StatusBadgeComponent],
  template: `
    <div class="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <!-- Toolbar Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="text-sm font-bold text-slate-900 dark:text-white">
            Handwritten Answer Sheet Canvas
          </span>
          <app-status-badge label="Non-Destructive SVG Layer" variant="info" />
        </div>

        <!-- Controls: Zoom / Pan / Layer toggle -->
        <div class="flex items-center gap-2">
          <!-- Page Navigator -->
          <div class="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              (click)="prevPage()"
              [disabled]="currentPage() <= 1"
              class="px-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
            >
              ◀
            </button>
            <span class="px-2 font-mono font-semibold text-slate-700 dark:text-slate-300">
              Page {{ currentPage() }} of {{ totalPages() }}
            </span>
            <button
              type="button"
              (click)="nextPage()"
              [disabled]="currentPage() >= totalPages()"
              class="px-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
            >
              ▶
            </button>
          </div>

          <!-- Zoom In / Out -->
          <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              (click)="zoomOut()"
              class="rounded px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer font-bold text-slate-600 dark:text-slate-300"
            >
              -
            </button>
            <span class="font-mono text-[11px] text-slate-600 dark:text-slate-400 min-w-[3rem] text-center">
              {{ zoomLevel() }}%
            </span>
            <button
              type="button"
              (click)="zoomIn()"
              class="rounded px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer font-bold text-slate-600 dark:text-slate-300"
            >
              +
            </button>
          </div>

          <!-- Toggle Red Pen Layer -->
          <app-button
            [variant]="showOverlay() ? 'accent' : 'secondary'"
            size="sm"
            [icon]="showOverlay() ? '👁️' : '🕶️'"
            [label]="showOverlay() ? 'Overlay On' : 'Overlay Off'"
            (clicked)="toggleOverlay()"
          />
        </div>
      </div>

      <!-- Canvas Area with Simulated Ruled Paper & AI Red Pen Annotations -->
      <div class="relative overflow-auto p-6 bg-slate-100 dark:bg-slate-950 min-h-[480px] flex items-center justify-center">
        <div
          [style.transform]="'scale(' + zoomLevel() / 100 + ')'"
          class="relative w-full max-w-2xl origin-top rounded-xl border border-slate-300 bg-amber-50/30 p-8 shadow-md transition-transform duration-150 font-serif dark:border-slate-700 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 select-none"
        >
          <!-- Ruled Paper Lines Simulation Background -->
          <div class="space-y-6 text-sm">
            <div class="border-b border-rose-200 pb-2 dark:border-rose-900/40">
              <span class="font-mono text-xs text-rose-500 font-bold">Roll No: 2026-NEET-042 | Candidate: Aarav Verma</span>
              <p class="mt-2 font-bold text-base text-slate-900 dark:text-white">
                Q3. Derive expression for capacitance of a parallel plate capacitor with dielectric slab.
              </p>
            </div>

            <div class="space-y-4 font-mono text-xs leading-relaxed">
              <p>1. Consider two plates of area $A$ separated by distance $d$.</p>
              <p>2. Surface charge density on plates $\sigma = \frac{Q}{A}$.</p>
              <p>3. Electric field in vacuum region $E_0 = \frac{\sigma}{\varepsilon_0} = \frac{Q}{A \varepsilon_0}$.</p>
              <p>4. When dielectric of constant $K$ is introduced, field reduces to $E = \frac{E_0}{K}$.</p>
              <p>5. Potential difference $V = E_0(d - t) + \frac{E_0}{K}t = E_0\left(d - t + \frac{t}{K}\right)$.</p>
              <p>6. Since capacitance $C = \frac{Q}{V}$, substituting $Q = \sigma A = E_0 \varepsilon_0 A$:</p>
              <p class="font-bold text-slate-900 dark:text-white">
                $\Rightarrow C = \frac{\varepsilon_0 A}{d - t\left(1 - \frac{1}{K}\right)}$
              </p>
              <p class="text-emerald-700 dark:text-emerald-400 font-semibold">Special Case: When slab fills entire space ($t = d$), $C = \frac{K \varepsilon_0 A}{d}$.</p>
            </div>
          </div>

          <!-- Non-Destructive AI Annotation Overlay Layer (Red Pen / Teacher Callouts) -->
          @if (showOverlay()) {
            <div class="pointer-events-none absolute inset-0">
              @for (marker of annotations(); track marker.id) {
                <div
                  [style.left.%]="marker.xPercent"
                  [style.top.%]="marker.yPercent"
                  class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-105"
                  (click)="markerClicked.emit(marker)"
                >
                  <!-- Callout badge -->
                  <div
                    [class]="markerBadgeClass(marker.type)"
                    class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-sans shadow-md backdrop-blur-xs"
                  >
                    <span class="font-bold">
                      {{ marker.type === 'correct' ? '✓' : '⚠️' }}
                    </span>
                    <span class="font-semibold">{{ marker.stepTitle }}</span>
                    <span class="rounded bg-white/70 px-1 py-0.2 font-mono text-[10px] font-bold text-slate-800 dark:bg-slate-900 dark:text-white">
                      +{{ marker.marksAwarded }}
                    </span>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Footer Info -->
      <div class="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
        <span>Original Submission SHA-256 Verified (Immutable Storage)</span>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          <span>Dual Layer Composite Active</span>
        </div>
      </div>
    </div>
  `,
})
export class AnswerSheetViewerComponent {
  public currentPage = signal<number>(1);
  public totalPages = signal<number>(2);
  public zoomLevel = signal<number>(100);
  public showOverlay = signal<boolean>(true);

  public annotations = input<IAnnotationMarker[]>([
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

  public markerClicked = output<IAnnotationMarker>();

  public prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  public nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  public zoomIn(): void {
    if (this.zoomLevel() < 150) {
      this.zoomLevel.update((z) => z + 10);
    }
  }

  public zoomOut(): void {
    if (this.zoomLevel() > 70) {
      this.zoomLevel.update((z) => z - 10);
    }
  }

  public toggleOverlay(): void {
    this.showOverlay.update((v) => !v);
  }

  public markerBadgeClass(type: string): string {
    switch (type) {
      case 'correct':
        return 'bg-emerald-500/90 text-white border-emerald-400 dark:bg-emerald-600/90';
      case 'partial':
        return 'bg-amber-500/90 text-white border-amber-400 dark:bg-amber-600/90';
      case 'wrong':
      default:
        return 'bg-rose-500/90 text-white border-rose-400 dark:bg-rose-600/90';
    }
  }
}
