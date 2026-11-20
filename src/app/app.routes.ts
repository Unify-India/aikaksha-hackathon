import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'voice-copilot',
  },
  {
    path: 'voice-copilot',
    loadComponent: () =>
      import('./features/voice-copilot/voice-copilot.component').then(
        (m) => m.VoiceCopilotComponent
      ),
    title: 'Voice Exam Copilot | AI Kaksha',
  },
  {
    path: 'exam-studio',
    loadComponent: () =>
      import('./features/exam-studio/exam-studio.component').then(
        (m) => m.ExamStudioComponent
      ),
    title: 'Exam Studio & Question Bank | AI Kaksha',
  },
  {
    path: 'review-gate',
    loadComponent: () =>
      import('./features/exam-studio/review-gate.component').then(
        (m) => m.ReviewGateComponent
      ),
    title: 'Teacher Review Gate | AI Kaksha',
  },
  {
    path: 'evaluation',
    loadComponent: () =>
      import('./features/evaluation/evaluation-cockpit.component').then(
        (m) => m.EvaluationCockpitComponent
      ),
    title: 'Subjective Evaluation Cockpit | AI Kaksha',
  },
  {
    path: '**',
    redirectTo: 'voice-copilot',
  },
];
