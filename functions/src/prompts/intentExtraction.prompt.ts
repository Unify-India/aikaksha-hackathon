import { Type } from '@google/genai';
import { generateStructuredJson } from '../providers/gemini.provider.js';
import { resolveKolkataTimeWindow, IResolvedDateTimeWindow } from '../utils/time.js';

export interface IExtractedSlotValues {
  detectedAction: 'CREATE_EXAM' | 'AUTO_DPP' | 'UNKNOWN';
  title?: string;
  batchName?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  questionCount?: number;
  durationMinutes?: number;
  marksPerQuestion?: number;
  negativeRule?: 'none' | '1/2' | '1/3' | '1/4';
  difficulty?: 'easy' | 'medium' | 'hard';
  dateText?: string; // 'today', 'tomorrow', '2026-11-21', etc.
  startTime?: string; // '10:00' or '10:00 AM'
  endTime?: string;
  examPattern?: 'CBSE' | 'NEET' | 'JEE' | 'ICSE' | 'BPSC' | 'Custom';
  language?: 'en' | 'hi';
  isSubjective?: boolean;
}

export interface IIntentExtractionResult {
  action: 'CREATE_EXAM' | 'AUTO_DPP' | 'UNKNOWN';
  confidence: number;
  rawTranscript: string;
  slots: IExtractedSlotValues;
  missingRequiredSlots: string[];
  isComplete: boolean;
  timeWindow?: IResolvedDateTimeWindow;
}

export const intentExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ['CREATE_EXAM', 'AUTO_DPP', 'UNKNOWN'],
      description: 'The primary detected user intention.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score from 0.0 to 1.0',
    },
    title: {
      type: Type.STRING,
      description: 'Descriptive title for the test or exam.',
    },
    batchName: {
      type: Type.STRING,
      description: 'The target student batch/class name (e.g. Lakshya 2026, Class 12 A, NEET Batch).',
    },
    subject: {
      type: Type.STRING,
      description: 'The academic subject (e.g. Physics, Chemistry, Mathematics, Biology).',
    },
    topic: {
      type: Type.STRING,
      description: 'Core chapter or topic name (e.g. Electrostatics, Ray Optics, Chemical Kinetics).',
    },
    subtopic: {
      type: Type.STRING,
      description: 'Specific subtopic if mentioned.',
    },
    questionCount: {
      type: Type.INTEGER,
      description: 'Number of questions requested.',
    },
    durationMinutes: {
      type: Type.INTEGER,
      description: 'Exam duration in minutes.',
    },
    marksPerQuestion: {
      type: Type.NUMBER,
      description: 'Marks awarded for each correct answer (e.g. 4 for NEET/JEE, 1 for standard).',
    },
    negativeRule: {
      type: Type.STRING,
      enum: ['none', '1/2', '1/3', '1/4'],
      description: 'Negative marking deduction fraction.',
    },
    difficulty: {
      type: Type.STRING,
      enum: ['easy', 'medium', 'hard'],
      description: 'Target difficulty tier.',
    },
    dateText: {
      type: Type.STRING,
      description: 'Natural language date or ISO date mentioned (e.g. tomorrow, today, monday, 2026-11-22).',
    },
    startTime: {
      type: Type.STRING,
      description: 'Start time formatted as HH:mm or HH:mm AM/PM (e.g. 10:00, 10:00 AM, 14:30).',
    },
    endTime: {
      type: Type.STRING,
      description: 'End time if explicitly specified.',
    },
    examPattern: {
      type: Type.STRING,
      enum: ['CBSE', 'NEET', 'JEE', 'ICSE', 'BPSC', 'Custom'],
      description: 'Standard exam pattern if indicated.',
    },
    language: {
      type: Type.STRING,
      enum: ['en', 'hi'],
      description: 'Primary language requested.',
    },
    isSubjective: {
      type: Type.BOOLEAN,
      description: 'True if subjective/derivation/answer-sheet based test is requested.',
    },
    missingRequiredSlots: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'List of mandatory missing parameters needed before publishing.',
    },
    isComplete: {
      type: Type.BOOLEAN,
      description: 'True if subject, topic, and questionCount or essential parameters are present.',
    },
  },
  required: ['action', 'confidence', 'missingRequiredSlots', 'isComplete'],
};

export const INTENT_SYSTEM_INSTRUCTION = `You are the AI Kaksha Intent Extraction Engine for Indian School and Coaching Teachers.
Analyze teacher spoken transcripts or typed queries and accurately extract structured parameters for either CREATE_EXAM or AUTO_DPP.

Rules & Guidelines:
1. Actions:
   - CREATE_EXAM: Teacher asks to create, schedule, draft, or conduct an exam, test, quiz, or mock test.
   - AUTO_DPP: Teacher asks to generate a Daily Practice Problem (DPP), practice worksheet, or revision set based on today's teaching or a specific topic.
   - UNKNOWN: Irrelevant or ambiguous queries.
2. Mark Schemes:
   - NEET defaults: 4 marks per question, negativeRule '1/4' (i.e. -1).
   - JEE defaults: 4 marks per question, negativeRule '1/4' (i.e. -1).
   - CBSE/School defaults: 1 mark per question (or specified), negativeRule 'none'.
3. Normalization:
   - Subject names: Normalize to Standard Title Case (e.g. "Physics", "Chemistry", "Mathematics", "Biology").
   - Batch names: Extract clean batch names like "Lakshya 2026", "Batch A", "Class 12 B".
4. Date & Time:
   - DO NOT perform date arithmetic. Simply capture 'dateText' (e.g. "tomorrow", "this friday", "today") and 'startTime' (e.g. "10:00 AM", "4 PM"). The server will resolve exact timestamps in Asia/Kolkata.
5. Completeness:
   - If subject and topic are identified, mark isComplete true unless questionCount is completely indeterminate.
`;

/**
 * Extracts intent and resolves server-side Indian Standard Time (Asia/Kolkata).
 */
export async function extractTeacherIntent(
  transcript: string,
  referenceDate: Date = new Date()
): Promise<IIntentExtractionResult> {
  const prompt = `Teacher input transcript:
"""${transcript}"""

Current reference date context: ${referenceDate.toISOString()}
Timezone: Asia/Kolkata (IST +05:30)

Extract the slot values into the JSON schema.`;

  const rawExtracted = await generateStructuredJson<{
    action: 'CREATE_EXAM' | 'AUTO_DPP' | 'UNKNOWN';
    confidence: number;
    title?: string;
    batchName?: string;
    subject?: string;
    topic?: string;
    subtopic?: string;
    questionCount?: number;
    durationMinutes?: number;
    marksPerQuestion?: number;
    negativeRule?: 'none' | '1/2' | '1/3' | '1/4';
    difficulty?: 'easy' | 'medium' | 'hard';
    dateText?: string;
    startTime?: string;
    endTime?: string;
    examPattern?: 'CBSE' | 'NEET' | 'JEE' | 'ICSE' | 'BPSC' | 'Custom';
    language?: 'en' | 'hi';
    isSubjective?: boolean;
    missingRequiredSlots?: string[];
    isComplete?: boolean;
  }>({
    model: 'gemini-2.5-flash',
    systemInstruction: INTENT_SYSTEM_INSTRUCTION,
    prompt,
    schema: intentExtractionSchema,
    temperature: 0.1,
    thinkingBudget: 0, // fast deterministic extraction
  });

  const slots: IExtractedSlotValues = {
    detectedAction: rawExtracted.action,
    title: rawExtracted.title,
    batchName: rawExtracted.batchName,
    subject: rawExtracted.subject,
    topic: rawExtracted.topic,
    subtopic: rawExtracted.subtopic,
    questionCount: rawExtracted.questionCount,
    durationMinutes: rawExtracted.durationMinutes,
    marksPerQuestion: rawExtracted.marksPerQuestion,
    negativeRule: rawExtracted.negativeRule,
    difficulty: rawExtracted.difficulty,
    dateText: rawExtracted.dateText,
    startTime: rawExtracted.startTime,
    endTime: rawExtracted.endTime,
    examPattern: rawExtracted.examPattern,
    language: rawExtracted.language,
    isSubjective: rawExtracted.isSubjective,
  };

  // Resolve time window via deterministic server utility
  const timeWindow = resolveKolkataTimeWindow(
    {
      dateText: slots.dateText,
      startTime: slots.startTime,
      endTime: slots.endTime,
      durationMinutes: slots.durationMinutes,
    },
    referenceDate
  );

  return {
    action: rawExtracted.action,
    confidence: rawExtracted.confidence ?? 0.95,
    rawTranscript: transcript,
    slots,
    missingRequiredSlots: rawExtracted.missingRequiredSlots ?? [],
    isComplete: rawExtracted.isComplete ?? false,
    timeWindow,
  };
}
