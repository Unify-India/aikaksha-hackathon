export const DEPLOYMENT_REGION = 'us-central1';

export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  ADMINS: 'admins',
  BATCHES: 'batches',
  MASTER_EXAMS: 'master_exams',
  EXAM_QUESTIONS: 'exam_questions',
  ANSWER_KEY: 'answerKey',
  SUBMISSIONS: 'submissions',
  REVIEW_GATES: 'review_gates',
  AUDIT_LOGS: 'audit_logs',
} as const;

export const RTDB_PATHS = {
  EXAM_SUBMISSIONS: 'exam_submissions',
  PROCTORING: 'proctoring',
} as const;
