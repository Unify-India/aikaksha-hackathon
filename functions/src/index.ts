import * as functions from 'firebase-functions/v1';
import { DEPLOYMENT_REGION } from './config/index.js';
import { onExamWrite } from './modules/exams/examTriggers.js';
import { publishExamWithReviewGate } from './modules/exams/examPublishCallable.js';
import { evaluateSubjectiveAnswer } from './modules/evaluation/subjectiveEvaluation.js';
import { mcpApp } from './modules/mcp/mcpGateway.js';

// Exam Triggers
export { onExamWrite };

// Review Gate and Publish Callables
export { publishExamWithReviewGate };

// Subjective Evaluation AI Callable
export { evaluateSubjectiveAnswer };

// MCP Agent Gateway HTTP API
export const mcpGateway = functions
  .region(DEPLOYMENT_REGION)
  .https.onRequest(mcpApp);
