---
name: google-vision-multimodal
description: Implement and integrate Google Cloud Vision API and Gemini multimodal vision capabilities for image recognition, OCR, diagram comprehension, and visual inspection.
---

# Google Vision & Multimodal Implementation Skill

This skill explains how to build and integrate vision capabilities into AI Kaksha and your MCP servers, choosing between Google Cloud Vision API (specialized feature detection) and Gemini Multimodal models (generative visual comprehension).

## When to Use Which Service

| Requirement | Google Cloud Vision API | Gemini Multimodal (e.g. Gemini 1.5/2.0 Flash) |
| :--- | :--- | :--- |
| **Document OCR / Text Extraction** | High precision bounding boxes (`DOCUMENT_TEXT_DETECTION`) | High contextual understanding & summarization |
| **Diagram & Math Recognition** | Raw shapes/text | Step-by-step reasoning & equation solving |
| **Facial / SafeSearch / Object Labels** | Dedicated classification endpoints | Zero-shot open prompts |
| **Cost & Latency** | Fast, per-feature pricing | Rich reasoning, versatile prompt-driven answers |

---

## 1. Cloud Vision API Integration

### Installation
```bash
npm install @google-cloud/vision
```

### TypeScript Usage Example
```typescript
import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient();

/**
 * Perform Optical Character Recognition (OCR) or label detection
 */
export async function detectTextAndLabels(imageBuffer: Buffer) {
  const [textResult] = await client.textDetection({
    image: { content: imageBuffer },
  });
  const textAnnotations = textResult.textAnnotations || [];
  const fullText = textAnnotations[0]?.description || '';

  const [labelResult] = await client.labelDetection({
    image: { content: imageBuffer },
  });
  const labels = (labelResult.labelAnnotations || []).map(l => l.description);

  return { fullText, labels };
}
```

---

## 2. Gemini Multimodal Vision Integration

Using `@google/genai` (or `@google/generative-ai`):

### Installation
```bash
npm install @google/genai
```

### Multimodal Image Query
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeImageWithGemini(imageBase64: string, mimeType: string, prompt: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          { text: prompt || 'Analyze this educational diagram or text and summarize key takeaways.' },
        ],
      },
    ],
  });

  return response.text;
}
```

---

## 3. Exposing via MCP Tool

In your MCP tool definition:

```typescript
{
  name: "analyze_educational_diagram",
  description: "Examines student diagrams, textbook pages, or formulas and provides explanations and extracted text",
  inputSchema: {
    type: "object",
    properties: {
      imageBase64: { type: "string", description: "Base64-encoded image data" },
      prompt: { type: "string", description: "Instruction for analysis" }
    },
    required: ["imageBase64"]
  }
}
```
