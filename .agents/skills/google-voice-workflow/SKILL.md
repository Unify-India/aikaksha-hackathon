---
name: google-voice-workflow
description: Implement end-to-end Google voice workflows, including Cloud Speech-to-Text (STT), Gemini Live/Bidirectional Audio, and Cloud Text-to-Speech (TTS) for conversational voice agents.
---

# Google Voice & Speech Workflow Skill

This skill provides full design and implementation recipes for building conversational voice workflows connected to Google Cloud Speech APIs and Gemini Realtime audio pipelines.

## 1. Core Components

1. **Speech-to-Text (STT)**: Converts incoming spoken audio from students/teachers into text transcripts (`@google-cloud/speech` or Web Speech API).
2. **LLM / Agent Logic**: Processes student questions, pedagogical reasoning, or MCP tool execution.
3. **Text-to-Speech (TTS)**: Synthesizes high-fidelity natural audio responses (`@google-cloud/text-to-speech`).
4. **Gemini Live / Multimodal Bidirectional Audio**: Low-latency direct voice-to-voice streaming using Gemini Multimodal Live API over WebSockets.

---

## 2. Speech-to-Text (Cloud STT v2)

### Dependencies
```bash
npm install @google-cloud/speech
```

### Audio Transcription Service
```typescript
import { v2 } from '@google-cloud/speech';

const speechClient = new v2.SpeechClient();

export async function transcribeAudio(audioBuffer: Buffer, projectId: string) {
  const recognizer = `projects/${projectId}/locations/global/recognizers/_`;
  
  const [response] = await speechClient.recognize({
    recognizer: recognizer,
    config: {
      autoDecodingConfig: {},
      languageCodes: ['en-US', 'hi-IN'], // Supports multilingual classroom settings
      model: 'chirp', // High-accuracy Google Chirp model
    },
    content: audioBuffer,
  });

  const transcripts = response.results
    ?.map(r => r.alternatives?.[0]?.transcript)
    .filter(Boolean)
    .join('\n');

  return transcripts || '';
}
```

---

## 3. High-Quality Text-to-Speech (Journey & Neural2 Voices)

### Dependencies
```bash
npm install @google-cloud/text-to-speech
```

### Voice Synthesis
```typescript
import textToSpeech from '@google-cloud/text-to-speech';

const ttsClient = new textToSpeech.TextToSpeechClient();

export async function synthesizeVoice(text: string, voiceName: string = 'en-US-Journey-F') {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: voiceName, // Natural conversational journey voice
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0,
    },
  });

  return response.audioContent as Buffer;
}
```

---

## 4. MCP Tools Registration

Expose voice capabilities in your MCP server:

```typescript
{
  name: "transcribe_speech",
  description: "Transcribes audio recording into text",
  inputSchema: {
    type: "object",
    properties: {
      audioBase64: { type: "string" },
      languageCode: { type: "string", default: "en-US" }
    },
    required: ["audioBase64"]
  }
},
{
  name: "speak_response",
  description: "Synthesizes pedagogical explanation into MP3 audio",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      voiceName: { type: "string", default: "en-US-Journey-F" }
    },
    required: ["text"]
  }
}
```
