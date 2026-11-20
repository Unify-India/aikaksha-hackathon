---
name: multimodal-image-generation
description: Connect and generate visual aids, diagram illustrations, and educational images using Google Imagen / Banana Nano (Gemini Flash on-device & Imagen endpoints) via MCP tools.
---

# Multimodal Image Generation Skill (Imagen & Banana / Gemini Nano)

This skill covers orchestrating image generation workflows, diagrams, and lightweight models (such as Nano Banana / Gemini Nano locally and Google Imagen on Vertex AI/Gemini API) for instructional content generation.

## 1. Overview

- **Cloud Generative Visuals (Google Imagen 3)**: High-resolution educational illustrations, diagrams, flashcard visuals via Google GenAI or Vertex AI.
- **On-Device / Lightweight (Gemini Nano / Banana)**: Local or edge inference for lightweight reasoning, low latency, and private classroom devices.

---

## 2. Generating Images with Imagen 3 via Google GenAI SDK

### Dependencies
```bash
npm install @google/genai
```

### Implementation
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateEducationalIllustration(prompt: string, aspectRatio: '1:1' | '16:9' | '4:3' = '16:9') {
  const response = await ai.models.generateImages({
    model: 'imagen-3.0-generate-002',
    prompt: `Educational illustration suitable for students: ${prompt}. Clean, high clarity, clear labels.`,
    config: {
      numberOfImages: 1,
      aspectRatio,
      outputMimeType: 'image/jpeg',
    },
  });

  const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
  return base64Image;
}
```

---

## 3. Banana Nano / Edge / On-Device Integration Pattern

When deploying lightweight models (e.g. Chrome Built-in Prompt API with Gemini Nano or Banana serverless micro-endpoints):

```typescript
export async function runLocalNanoInference(prompt: string, endpointUrl: string = 'http://localhost:8000/predict') {
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return await res.json();
}
```

---

## 4. Exposing via MCP Tool

```typescript
{
  name: "generate_lesson_visual",
  description: "Generates an educational image, diagram, or visual aid based on a descriptive prompt",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Detailed description of the visual to generate" },
      aspectRatio: { type: "string", enum: ["1:1", "16:9", "4:3"], default: "16:9" }
    },
    required: ["prompt"]
  }
}
```
