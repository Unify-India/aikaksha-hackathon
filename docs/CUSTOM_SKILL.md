To build a reusable **Gemini Question Generation Skill** and integrate it into **AiKaksha**, the cleanest approach is to package it as a **Structured Output microservice** inside your Firebase Cloud Functions.

Rather than relying on fragile prompt-only rules to avoid broken JSON or stray Markdown, you should combine **System Instructions** with the **Gemini API’s Structured Outputs (`responseSchema`)** so the model is mathematically constrained to return your exact bilingual Firestore schema.

---

### 1. Architecting the Gemini "Skill" (Schema + System Instructions)

Define the skill using two components: a **strict JSON Schema** (matching your `question_banks` bilingual structure) and a **System Instruction** that enforces KaTeX-compatible LaTeX and Indian exam standards (JEE/NEET/UPSC/State Boards).

* **Model Choice:** Use `gemini-2.5-flash`. It is fast, cost-effective for high-margin micro-SaaS, and natively supports strict JSON Schema enforcement.


* **Output Format:** Force `application/json` so your Angular frontend can parse and render it immediately without regex hacks.



---

### 2. Backend Implementation (Firebase Cloud Function)

Create a dedicated callable function in your Node 20 Cloud Functions backend (`functions/src/modules/ai/question-generator.ts`). This securely proxies the Gemini API key and hooks directly into your **Token Economy** or **BYOK (Bring Your Own Key)** flow.

```typescript
import * as functions from 'firebase-functions';
import { GoogleGenAI, Type } from '@google/genai';

// 1. Define the strict schema matching AiKaksha's bilingual Firestore model
const questionBankSchema = {
  type: Type.ARRAY,
  description: "List of generated multiple-choice questions",
  items: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING },
      topic: { type: Type.STRING },
      difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
      en: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "Question text in English with KaTeX LaTeX" },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, enum: ["opt1", "opt2", "opt3", "opt4"] },
                text: { type: Type.STRING }
              },
              required: ["id", "text"]
            }
          }
        },
        required: ["text", "options"]
      },
      hi: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "Question text in Hindi with KaTeX LaTeX" },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, enum: ["opt1", "opt2", "opt3", "opt4"] },
                text: { type: Type.STRING }
              },
              required: ["id", "text"]
            }
          }
        },
        required: ["text", "options"]
      },
      correct_option_id: { type: Type.STRING, enum: ["opt1", "opt2", "opt3", "opt4"] },
      explanation: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          hi: { type: Type.STRING }
        },
        required: ["en", "hi"]
      }
    },
    required: ["subject", "topic", "difficulty", "en", "hi", "correct_option_id", "explanation"]
  }
};

// 2. Define the Skill's System Instruction
const SYSTEM_INSTRUCTION = `
You are an expert examiner for Indian competitive exams (JEE, NEET, UPSC, SSC, State Boards).
Generate accurate, original questions in both English (en) and natural Hindi (hi).
CRITICAL FORMATTING RULES:
- Format all math/chemistry equations in strict KaTeX-compatible LaTeX.
- Use inline math ($...$) and block math ($$...$$).
- NEVER use unsupported LaTeX environments like \\begin{align}.
- Ensure the correct_option_id matches the exact same answer in both English and Hindi.
`;

// 3. Callable Cloud Function
export const generateQuestionsSkill = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required.');
  }

  const { subject, topic, difficulty, count = 5, customContext = '', byokApiKey } = data;

  // Use Teacher's BYOK key if provided; otherwise use platform key & deduct tokens
  const apiKey = byokApiKey || process.env.GEMINI_API_KEY;
  if (!byokApiKey) {
    // TODO: Run atomic Firestore transaction to deduct tokens from institute_wallets
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = `
    Generate ${count} multiple-choice questions.
    Subject: ${subject}
    Topic: ${topic}
    Difficulty: ${difficulty}
    ${customContext ? `Additional Context/Storyline: ${customContext}` : ''}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: questionBankSchema,
        temperature: 0.4 // Lower temperature reduces math hallucinations
      }
    });

    const questions = JSON.parse(response.text || '[]');
    return { success: true, questions };
  } catch (error) {
    console.error('Gemini Skill Error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate questions.');
  }
});

```

---

### 3. Frontend Integration (Angular + Ionic Teacher Dashboard)

Integrate this skill into your **Teacher Web Dashboard** using the **Form-to-Prompt** pattern so grassroots teachers don't have to write prompts manually.

1. **Form-to-Prompt UI:** Provide structured dropdowns for **Subject**, **Topic**, **Difficulty**, and **Question Count**, plus an optional text box for a custom storyline or syllabus snippet.


2. **Angular Service Call:**
```typescript
// ai-skill.service.ts
import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Injectable({ providedIn: 'root' })
export class AiSkillService {
  private functions = inject(Functions);

  async generateQuestions(payload: {
    subject: string;
    topic: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    count: number;
    customContext?: string;
    byokApiKey?: string;
  }) {
    const fn = httpsCallable(this.functions, 'generateQuestionsSkill');
    const result: any = await fn(payload);
    return result.data.questions;
  }
}

```


3. **The "Safety Catch" Review Screen:** Never push AI-generated questions directly into a live exam. Render the returned JSON array in a preview list using your existing **KaTeX directive** with an **EN/HI toggle**. Give the teacher an **Edit** button to fix any minor LaTeX or calculation errors before clicking **"Approve & Save to Question Bank"** (which writes to `question_banks/{instituteId}/questions/{questionId}`) or **"Export to Branded PDF"**.



---

### 4. Cost & Security Guardrails

* **App Check:** Enable Firebase App Check enforcement on `generateQuestionsSkill` so unauthorized scripts cannot drain your Gemini API quota.


* **Rate Limiting / Token Caps:** Cap `count` at 10–15 questions per request to prevent timeouts and keep token usage predictable.
* **BYOK Routing:** If a teacher enters their own Gemini API key in settings, you can either pass it securely to the Cloud Function (without logging it) or call the Gemini REST API directly from the Angular client to save 100% on Cloud Function invocations.


