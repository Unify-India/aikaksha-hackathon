import { Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';
import { IChatMessage } from '../data/chat-history.store';

@Component({
  selector: 'app-chat-thread',
  host: { class: 'block min-h-0 flex-1' },
  template: `
    <div #scroller class="h-full overflow-y-auto">
      <ol role="log" aria-live="polite" aria-label="Conversation" class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        @for (m of messages(); track m.id) {
          @if (m.text.trim()) {
            @if (m.role === 'user') {
              <li class="flex justify-end">
                <span class="sr-only">You said:</span>
                <p class="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-slate-100 px-5 py-3 text-base text-slate-900 dark:bg-slate-800 dark:text-slate-100">{{ m.text.trim() }}</p>
              </li>
            } @else {
              <li class="flex gap-3">
                <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white" aria-hidden="true">क</span>
                <span class="sr-only">AI Kaksha said:</span>
                <p class="max-w-[85%] whitespace-pre-wrap pt-1 text-base leading-relaxed text-slate-800 dark:text-slate-200">{{ m.text.trim() }}</p>
              </li>
            }
          }
        }
        <ng-content />
      </ol>
    </div>
  `,
})
export class ChatThreadComponent {
  readonly messages = input.required<readonly IChatMessage[]>();
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Keep the newest words in view as transcripts stream in.
    afterRenderEffect(() => {
      this.messages();
      const el = this.scroller().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }
}
