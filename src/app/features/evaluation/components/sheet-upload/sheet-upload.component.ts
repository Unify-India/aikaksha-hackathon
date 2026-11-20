import { Component, computed, input, output, signal } from '@angular/core';
import { studentLabel, validateSheetFile } from '../../data/evaluation.store';
import { FileDropZoneComponent } from '../file-drop-zone/file-drop-zone.component';

/**
 * Step 2 of grading: choose the class's answer sheets.
 * Sheets are listed as "Student A", "Student B"… — real file names (which often contain names) are never shown.
 */
@Component({
  selector: 'app-sheet-upload',
  imports: [FileDropZoneComponent],
  template: `
    <section
      aria-labelledby="sheets-heading"
      class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="sheets-heading" class="text-base font-bold text-slate-900 dark:text-white">2. Answer sheets</h2>
      <p class="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        Upload the whole class at once. Papers are graded one at a time and results appear as each finishes.
      </p>

      <div class="mt-4">
        <app-file-drop-zone
          label="Add answer sheets"
          hint="PDF files, one per student · up to 30 MB each · names are hidden"
          accept="application/pdf"
          [multiple]="true"
          [disabled]="disabled()"
          (filesSelected)="add($event)"
        />
      </div>

      @if (rejected().length) {
        <ul role="alert" class="mt-3 space-y-1 text-sm text-rose-800 dark:text-rose-300">
          @for (problem of rejected(); track problem) {
            <li>⚠ {{ problem }}</li>
          }
        </ul>
      }

      @if (files().length) {
        <ul class="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          @for (file of files(); track $index; let i = $index) {
            <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span class="font-semibold text-slate-900 dark:text-white">{{ label(i) }}</span>
              <span class="text-xs text-slate-600 dark:text-slate-300">{{ kind(file) }} · {{ size(file) }}</span>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-rose-300 dark:hover:bg-rose-950"
                [attr.aria-label]="'Remove ' + label(i)"
                [disabled]="disabled()"
                (click)="remove(i)"
              >
                Remove
              </button>
            </li>
          }
        </ul>
      }

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-600 dark:text-slate-300">
          @if (!schemeReady()) {
            Choose an approved marking scheme first.
          } @else {
            {{ files().length }} {{ files().length === 1 ? 'sheet' : 'sheets' }} ready
          }
        </p>
        <button
          type="button"
          class="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          [disabled]="!canStart()"
          (click)="start.emit(files())"
        >
          {{ uploading() ? 'Uploading…' : 'Grade ' + files().length + ' ' + (files().length === 1 ? 'sheet' : 'sheets') }}
        </button>
      </div>
    </section>
  `,
})
export class SheetUploadComponent {
  readonly schemeReady = input(false);
  readonly uploading = input(false);
  readonly disabled = input(false);

  readonly start = output<File[]>();

  protected readonly files = signal<File[]>([]);
  protected readonly rejected = signal<string[]>([]);
  protected readonly canStart = computed(
    () => this.schemeReady() && this.files().length > 0 && !this.uploading() && !this.disabled(),
  );

  protected add(incoming: File[]): void {
    const problems = incoming.map(validateSheetFile).filter((p): p is string => p !== null);
    // Problems mention the original file name; show only a count so student names stay hidden.
    this.rejected.set(problems.length ? [`${problems.length} file(s) skipped: only PDF files up to 30 MB.`] : []);
    const accepted = incoming.filter((f) => validateSheetFile(f) === null);
    this.files.update((list) => [...list, ...accepted]);
  }

  protected remove(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  protected label(index: number): string {
    return studentLabel(index);
  }

  protected kind(file: File): string {
    return file.type === 'application/pdf' ? 'PDF' : 'Photo';
  }

  protected size(file: File): string {
    return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
