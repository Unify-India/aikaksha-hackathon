import { Component, input, output, signal } from '@angular/core';

/**
 * Accessible file picker: a real <input type="file"> (keyboard + screen-reader friendly)
 * wrapped in a label that also accepts drag-and-drop.
 */
@Component({
  selector: 'app-file-drop-zone',
  template: `
    <label
      class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-indigo-600 has-[input:focus-visible]:ring-offset-2"
      [class]="
        dragging()
          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
          : 'border-slate-300 bg-slate-50 hover:border-indigo-500 dark:border-slate-600 dark:bg-slate-800/40'
      "
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <span aria-hidden="true" class="text-2xl">📄</span>
      <span class="text-sm font-semibold text-slate-900 dark:text-white">{{ label() }}</span>
      <span class="text-xs text-slate-600 dark:text-slate-300">{{ hint() }}</span>
      <input
        type="file"
        class="sr-only"
        [accept]="accept()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        (change)="onChange($event)"
      />
    </label>
  `,
})
export class FileDropZoneComponent {
  readonly label = input.required<string>();
  readonly hint = input('Drag files here, or press Enter to browse');
  readonly accept = input('application/pdf,image/png,image/jpeg,image/webp');
  readonly multiple = input(false);
  readonly disabled = input(false);

  readonly filesSelected = output<File[]>();

  protected readonly dragging = signal(false);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    this.emit(files);
  }

  protected onChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    this.emit(Array.from(inputEl.files ?? []));
    inputEl.value = ''; // allow choosing the same file again
  }

  private emit(files: File[]): void {
    const chosen = this.multiple() ? files : files.slice(0, 1);
    if (chosen.length) this.filesSelected.emit(chosen);
  }
}
