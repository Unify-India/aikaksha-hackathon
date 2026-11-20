/**
 * MCP prompts: ready-made teacher actions that MCP clients show as a pick list
 * (usually under "/" in the chat box, with a small form for the fields).
 * Each prompt tells the AI which aikaksha tools to call, in what order, and what to show.
 *
 * Owner: Sakshi.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const ask = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
});

const SAFETY =
  'Never publish anything unless I explicitly say so. If a tool returns needs_input, ask me for exactly the missing settings.';

export function registerAikakshaPrompts(server: McpServer): void {
  server.registerPrompt(
    'show_my_batches',
    {
      title: 'Show my batches',
      description: 'List my batches, classes and subjects.',
    },
    () => ask('Use the aikaksha tool list_my_batches and show my batches as a short table (name, class, target exam, students).'),
  );

  server.registerPrompt(
    'create_exam',
    {
      title: 'Create an exam',
      description: 'The AI asks you one question at a time: batch, subject, topic, questions, date and time, marking.',
    },
    () =>
      ask(
        'I want to create an exam. Call the aikaksha tool get_exam_options, then ask me ONE question at a time, ' +
          'offering the options it returns as choices (I may also type my own):\n' +
          '1. Which batch? Offer my batches plus "Create a new batch" (not "other"). If I choose a new batch, ask its ' +
          'name, class, target exam, subject and number of students, then call create_batch.\n' +
          "2. Subject: use the chosen batch's subject; do NOT ask unless I say the exam is for a different subject.\n" +
          '3. Which topic (chapter)? Offer the topics for that subject.\n4. How many questions and what difficulty?\n' +
          '5. Which date and start time?\n6. Duration or end time?\n7. Marking scheme?\n' +
          'SHORTCUT: if any of my answers contains several settings or the whole request (for example "Chemistry exam ' +
          'for Arjuna 2027, 10 questions, 23 Nov 10 to 10:30am"), call understand_exam_request on it, use everything it ' +
          'found, skip those questions and ask only what is still missing. If nothing is missing, create the exam right ' +
          'away. If I give a range of questions (e.g. 10-15), use the higher number (max 15) and tell me.\n' +
          'Do not assume any answer and do not suggest ready-made presets. When everything is known, ' +
          'call create_ai_exam with those fields (batchId, subject, topic, count, difficulty, date, startTime, ' +
          'durationMinutes or endTime, marks, negativeRule, examPattern). Finally show a short teacher-friendly summary (title, batch, topic, questions, date and time, marking) and the answer-check result with every flag. ' +
          SAFETY,
      ),
  );

  server.registerPrompt(
    'understand_exam_request',
    {
      title: 'Check my exam request',
      description: 'Type your exam in one sentence; see what was understood and what is missing before anything is created.',
      // Optional: some clients (e.g. Antigravity) open prompts without a form, so the AI asks for the sentence instead.
      argsSchema: {
        request: z
          .string()
          .optional()
          .describe('e.g. "Chemistry test for Arjuna 2027 on Chemical Kinetics, 10 MCQs, 4 marks, 1/4 negative, 23 Nov 2026 10 to 10:30 AM"'),
      },
    },
    ({ request }) =>
      ask(
        (request?.trim()
          ? `Use the aikaksha tool understand_exam_request on: "${request.trim()}".\n`
          : 'Ask me to type my exam request in one sentence (for example: "Chemistry test for Arjuna 2027 on ' +
            'Chemical Kinetics, 10 MCQs, 4 marks each, 1/4 negative, 23 Nov 2026 from 10 to 10:30 AM"). ' +
            'Then use the aikaksha tool understand_exam_request on what I type.\n') +
          'Show me, in a short list, what you understood: batch, subject, topic, number of questions, difficulty, ' +
          'date and time (IST), duration, marking. Then list anything that is missing or unclear (for example a date ' +
          'that does not match its weekday, or an unknown batch) and ask me only for those.\n' +
          'Do not create anything yet. When everything is clear, ask "Shall I create this exam?" and only if I say yes, ' +
          'call create_ai_exam and show the summary with the answer-check result. ' +
          SAFETY,
      ),
  );

  server.registerPrompt(
    'review_exam',
    {
      title: 'Review an exam',
      description: 'Pick one of your exams and see every question with its answer and the answer-check result.',
      argsSchema: { exam: z.string().optional().describe('Exam title (leave empty to choose from your list)') },
    },
    ({ exam }) =>
      ask(
        (exam
          ? `I want to review my exam "${exam}". Call list_my_exams, find the exam that matches that title (ask me if more than one matches), `
          : 'I want to review one of my exams. Call list_my_exams, show them to me as numbered choices (title, batch, date, status) and ask which one; ') +
          'then call review_exam for my choice. Show each question with its options (mark the correct answer with ✔), ' +
          'a one-line explanation, and the answer-check result, flagged questions first with the reason in plain words.',
      ),
  );

  server.registerPrompt(
    'publish_exam',
    {
      title: 'Publish an exam',
      description: 'Publish a reviewed draft to students (answers are never sent to students).',
      argsSchema: { exam: z.string().optional().describe('Exam title (leave empty to choose from your drafts)') },
    },
    ({ exam }) =>
      ask(
        (exam
          ? `I want to publish my exam "${exam}". Call list_my_exams with status "draft", find the matching exam (ask me if more than one matches). `
          : 'I want to publish one of my exams. Call list_my_exams with status "draft", show my drafts as numbered choices (title, batch, date) and ask which one. ') +
          'Then call review_exam for it and show me the answer-check result and any flagged questions, and ask me to confirm. ' +
          'Only after I confirm, call publish_exam with that exam. ' +
          'If there are flags, set acknowledgeFlags only if I explicitly say I reviewed them.',
      ),
  );
}
