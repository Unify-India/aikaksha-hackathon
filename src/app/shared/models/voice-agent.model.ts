import { NegativeMarkingRule, QuestionType } from '../../core/config/app.constants';

export interface IMCPToolCall<T = Record<string, unknown>> {
  name: 'resolve_teacher_context' | 'create_exam' | 'generate_and_attach_questions' | 'finalize_and_publish_exam' | string;
  parameters: T;
  callId: string;
  status: 'pending' | 'executing' | 'success' | 'failed';
  result?: unknown;
  error?: string;
  executionDurationMs?: number;
}

export interface IVoiceIntent {
  rawTranscript: string;
  detectedAction: 'CREATE_EXAM' | 'EDIT_QUESTIONS' | 'PUBLISH_EXAM' | 'EVALUATE_SUBMISSION' | 'UNKNOWN';
  confidence: number;
  extractedSlots: {
    title?: string;
    batchName?: string;
    batchId?: string;
    subject?: string;
    topic?: string;
    subtopic?: string;
    questionCount?: number;
    durationMinutes?: number;
    marksPerQuestion?: number;
    negativeRule?: NegativeMarkingRule;
    questionType?: QuestionType;
    difficulty?: 'easy' | 'medium' | 'hard';
    scheduledDate?: string;
    startTime?: string;
    endTime?: string;
    examPattern?: string;
  };
  missingRequiredSlots: string[];
  isComplete: boolean;
}

export interface IAgentTranscriptStep {
  id: string;
  timestamp: number;
  sender: 'user' | 'agent' | 'system';
  text: string;
  intent?: IVoiceIntent;
  toolCall?: IMCPToolCall;
  audioDurationMs?: number;
}
