import { IBatch } from '../../../shared/models';

/**
 * Batches (student cohorts) the signed-in teacher may create exams for.
 * Subjects are informational only: an exam can be in any subject, and the agent never restricts by them.
 *
 * `batch-lakshya-2026` mirrors the Firestore seed (functions/src/config/seed.ts); the other two are
 * demo batches so Class 10 / JEE requests have a valid target.
 * TODO: load from POST /api/tools/resolve_teacher_context once the client service exists.
 */
export const TEACHER_BATCHES: readonly IBatch[] = [
  {
    id: 'batch-lakshya-2026',
    name: 'Lakshya 2026',
    code: 'LAK-26',
    classLevel: 'Class 12',
    examPattern: 'NEET',
    subjects: [{ id: 'physics', name: 'Physics' }, { id: 'chemistry', name: 'Chemistry' }, { id: 'biology', name: 'Biology' }],
    assignedTeacherIds: ['teacher-sharma-101'],
    studentCount: 45,
    academicYear: '2025-26',
  },
  {
    id: 'batch-abhimanyu-jee-2027',
    name: 'Abhimanyu JEE 2027',
    code: 'ABH-27',
    classLevel: 'Class 11',
    examPattern: 'JEE Main',
    subjects: [{ id: 'physics', name: 'Physics' }, { id: 'chemistry', name: 'Chemistry' }, { id: 'maths', name: 'Mathematics' }],
    assignedTeacherIds: ['teacher-sharma-101'],
    studentCount: 38,
    academicYear: '2025-26',
  },
  {
    id: 'batch-class10-a',
    name: 'Class 10 – Section A',
    code: 'X-A',
    classLevel: 'Class 10',
    examPattern: 'CBSE',
    subjects: [
      { id: 'hindi', name: 'Hindi' },
      { id: 'english', name: 'English' },
      { id: 'maths', name: 'Mathematics' },
      { id: 'science', name: 'Science' },
      { id: 'sst', name: 'Social Science' },
    ],
    assignedTeacherIds: ['teacher-sharma-101'],
    studentCount: 52,
    academicYear: '2025-26',
  },
];

/**
 * Words that mean the teacher named a batch (lower-case; Devanagari too, because Hinglish speech is
 * sometimes transcribed in Hindi script). A class ("class 10") or pattern ("NEET") alone is not here
 * on purpose: the batch must be the teacher's choice, never the agent's guess.
 */
export const BATCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'batch-lakshya-2026': ['lakshya', 'लक्ष्य', 'lak 26'],
  'batch-abhimanyu-jee-2027': ['abhimanyu', 'अभिमन्यु', 'abh 27'],
  'batch-class10-a': ['section a', 'sec a', '10 a', '10a', 'x a', 'सेक्शन ए', 'सेक्शन a'],
};

export const TEACHER_NAME = 'Prof. R. Sharma';
export const INSTITUTE_TIMEZONE = 'Asia/Kolkata';
