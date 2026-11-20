import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IStudioExam } from '../../../shared/models/exam-read.model';

@Component({
  selector: 'app-exam-list',
  imports: [RouterLink],
  template: `
    <ul class="flex flex-col gap-1">
      @for (exam of exams(); track exam.id) {
        <li>
          <a
            [routerLink]="['/exam-studio', exam.id]"
            [attr.aria-current]="exam.id === selectedId() ? 'page' : null"
            [class]="exam.id === selectedId()
              ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800'
              : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/70'"
            class="block rounded-xl border px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <span class="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{{ exam.title }}</span>
            <span class="mt-1 block text-xs text-slate-600 dark:text-slate-400">
              {{ exam.totalQuestions }} questions · {{ exam.totalMarks }} marks{{ exam.date ? ' · ' + exam.date : '' }}
            </span>
            <span class="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">{{ exam.status }}</span>
          </a>
        </li>
      }
    </ul>
  `,
})
export class ExamListComponent {
  readonly exams = input.required<readonly IStudioExam[]>();
  readonly selectedId = input<string | null>(null);
}
