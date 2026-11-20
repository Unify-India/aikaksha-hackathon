import { IStudioExam, IStudioExamDetail } from '../../../shared/models/exam-read.model';

/**
 * Real responses captured from the `api` function (functions emulator + Firestore emulator) after
 * POST /api/exams/create-complete with a Voice-Copilot-shaped payload. Contract test fixture:
 * if the server's read model changes, the Exam Studio spec using this fails.
 */
export const LIVE_LIST_RESPONSE: { exams: IStudioExam[] } = {
  "exams": [
    {
      "id": "exam_80eb8866",
      "title": "NEET Class 12 Physics: Electrostatics — Practice Test",
      "subject": "Physics",
      "status": "draft",
      "batchId": "batch-lakshya-2026",
      "classLevel": "Class 12",
      "examPattern": "NEET",
      "totalQuestions": 3,
      "totalMarks": 12,
      "duration": 45,
      "defaultMarks": 4,
      "defaultNegativeMarks": 1,
      "date": "2026-11-23",
      "startTime": "10:00",
      "endTime": "10:45",
      "createdAt": "2026-11-20T21:59:42.054Z"
    },
    {
      "id": "exam_7ee6bc6d",
      "title": "NEET Class 12 Physics: Electrostatics — Practice Test",
      "subject": "Physics",
      "status": "draft",
      "batchId": "batch-lakshya-2026",
      "classLevel": "Class 12",
      "examPattern": "NEET",
      "totalQuestions": 2,
      "totalMarks": 8,
      "duration": 45,
      "defaultMarks": 4,
      "defaultNegativeMarks": 1,
      "date": "2026-11-23",
      "startTime": "10:00",
      "endTime": "10:45",
      "createdAt": "2026-11-20T21:58:45.870Z"
    }
  ]
};

export const LIVE_DETAIL_RESPONSE: IStudioExamDetail = {
  "exam": {
    "id": "exam_80eb8866",
    "title": "NEET Class 12 Physics: Electrostatics — Practice Test",
    "subject": "Physics",
    "status": "draft",
    "batchId": "batch-lakshya-2026",
    "classLevel": "Class 12",
    "examPattern": "NEET",
    "totalQuestions": 3,
    "totalMarks": 12,
    "duration": 45,
    "defaultMarks": 4,
    "defaultNegativeMarks": 1,
    "date": "2026-11-23",
    "startTime": "10:00",
    "endTime": "10:45",
    "createdAt": "2026-11-20T21:59:42.054Z"
  },
  "questions": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "MCQ",
      "marks": 4,
      "negativeMarks": 1,
      "topic": "Electrostatics",
      "subtopic": "Gauss's Law",
      "difficulty": "medium",
      "text": "A point charge $q$ is at the centre of a cube. What is the electric flux through one face?",
      "options": [
        {
          "id": "opt1",
          "text": "$\\frac{q}{\\varepsilon_0}$"
        },
        {
          "id": "opt2",
          "text": "$\\frac{q}{6\\varepsilon_0}$"
        },
        {
          "id": "opt3",
          "text": "$\\frac{q}{4\\pi\\varepsilon_0}$"
        },
        {
          "id": "opt4",
          "text": "$0$"
        }
      ],
      "correctOptionId": "opt2",
      "explanation": "Total flux is $$\\Phi = \\frac{q}{\\varepsilon_0}$$ shared equally by 6 faces, so each face gets $\\frac{q}{6\\varepsilon_0}$."
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "MCQ",
      "marks": 4,
      "negativeMarks": 1,
      "topic": "Electrostatics",
      "subtopic": "Capacitance",
      "difficulty": "easy",
      "text": "A capacitor $C_0 = 8\\,\\text{pF}$ has its plate gap halved and is filled with a dielectric $K = 6$. New capacitance?",
      "options": [
        {
          "id": "opt1",
          "text": "$24\\,\\text{pF}$"
        },
        {
          "id": "opt2",
          "text": "$48\\,\\text{pF}$"
        },
        {
          "id": "opt3",
          "text": "$96\\,\\text{pF}$"
        },
        {
          "id": "opt4",
          "text": "$12\\,\\text{pF}$"
        }
      ],
      "correctOptionId": "opt3",
      "explanation": "$C' = 2KC_0 = 2 \\times 6 \\times 8 = 96\\,\\text{pF}$."
    },
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "type": "Numeric",
      "marks": 4,
      "negativeMarks": 0,
      "topic": "Electrostatics",
      "subtopic": "Coulomb's Law",
      "difficulty": "hard",
      "text": "Two charges of $1\\,\\mu\\text{C}$ are $1\\,\\text{m}$ apart. Force between them in mN? (Take $k = 9 \\times 10^9$)",
      "options": [],
      "answer": "9",
      "explanation": "$F = k\\frac{q^2}{r^2} = 9 \\times 10^9 \\times 10^{-12} = 9 \\times 10^{-3}\\,\\text{N} = 9\\,\\text{mN}$."
    }
  ]
};
