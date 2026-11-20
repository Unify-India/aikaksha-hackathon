import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IChatSession } from '../data/chat-history.store';

@Component({
  selector: 'app-chat-sidebar',
  imports: [DatePipe],
  host: { class: 'flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60' },
  template: `
    <div class="p-3">
      <button
        type="button"
        (click)="newChat.emit()"
        class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>
    </div>

    <h2 class="px-6 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Recent</h2>
    <nav aria-label="Previous voice sessions" class="flex-1 overflow-y-auto px-3 pb-3">
      @if (sessions().length === 0) {
        <p class="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">Your conversations will appear here.</p>
      } @else {
        <ul class="flex flex-col gap-0.5">
          @for (session of sessions(); track session.id) {
            <li class="group relative">
              <button
                type="button"
                (click)="open.emit(session.id)"
                [attr.aria-current]="session.id === activeId() ? 'page' : null"
                [class]="
                  session.id === activeId()
                    ? 'bg-indigo-100 text-indigo-900 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800/70'
                "
                class="flex w-full flex-col items-start rounded-lg py-2 pl-3 pr-9 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <span class="flex w-full items-center gap-1.5">
                  @if (session.result) {
                    <span class="text-emerald-700 dark:text-emerald-400" aria-hidden="true">✓</span>
                    <span class="sr-only">Completed:</span>
                  }
                  <span class="truncate">{{ session.title }}</span>
                </span>
                <span class="text-xs text-slate-600 dark:text-slate-400">{{ session.updatedAt | date: 'd MMM, h:mm a' }}</span>
              </button>
              <button
                type="button"
                (click)="remove.emit(session.id)"
                [attr.aria-label]="'Delete ' + session.title"
                title="Delete"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 opacity-0 transition hover:bg-rose-100 hover:text-rose-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-rose-500 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-300"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }
    </nav>
  `,
})
export class ChatSidebarComponent {
  readonly sessions = input.required<readonly IChatSession[]>();
  readonly activeId = input<string | null>(null);
  readonly newChat = output<void>();
  readonly open = output<string>();
  readonly remove = output<string>();
}
