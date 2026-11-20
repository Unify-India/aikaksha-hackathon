---
name: google-cloud-agent-mcp
description: Guide and runbook to build, configure, and connect Model Context Protocol (MCP) servers with Google Cloud Platform (GCP), Vertex AI, Gemini models, Vision API, Voice/Speech APIs, and Google Data Agents.
---

# Google Cloud & Google Data Agent MCP Integration Skill

This skill guides developers through designing, building, and deploying a Model Context Protocol (MCP) server that connects AI workflows to Google Cloud Platform (GCP) services, Vertex AI, Gemini models, and Google Data Agents.

## 1. Overview & Architecture

An MCP (Model Context Protocol) server acts as a bridge between an AI Assistant/Agent (such as Antigravity or a custom client) and external tools/data sources.

```
+--------------------------------------------------------------+
|                    Client / Agent (AI Kaksha)               |
+--------------------------------------------------------------+
                               | (MCP Protocol: STDIO or SSE)
                               v
+--------------------------------------------------------------+
|                   Custom Google MCP Server                  |
|  - MCP Tools: vision_inspect, generate_image, speech_to_text |
|  - MCP Resources: BigQuery datasets, Agent datastores         |
|  - Auth: Google Application Default Credentials (ADC)        |
+--------------------------------------------------------------+
                               |
                               +---> Cloud Vision API / Gemini Flash Multimodal
                               +---> Imagen / Banana Nano (Image Gen)
                               +---> Cloud Speech-to-Text & Text-to-Speech
                               +---> Vertex AI Search & Google Data Agent
```

---

## 2. Prerequisites & Authentication

### GCP Authentication Setup
Ensure Google Application Default Credentials (ADC) or a Service Account key is configured:

```bash
# Authenticate using gcloud CLI
gcloud auth application-default login

# Or set service account key environment variable
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GCP_PROJECT_ID="your-project-id"
export GCP_LOCATION="us-central1"
```

Required GCP IAM Roles:
- **Cloud Vision**: `roles/serviceusage.serviceUsageConsumer`
- **Vertex AI (Gemini / Imagen / Data Agent)**: `roles/aiplatform.user`
- **Speech APIs**: `roles/speech.client`
- **Google Data Agent / Vertex AI Search**: `roles/discoveryengine.editor` or `roles/discoveryengine.viewer`

---

## 3. Recommended Project Structure for Custom MCP Server

When creating the MCP server (Node.js/TypeScript or Python):

```
mcp-google-server/
├── package.json (or pyproject.toml / requirements.txt)
├── tsconfig.json
├── src/
│   ├── index.ts               # MCP Server setup & tool registration
│   ├── auth.ts                # Google Auth client & configuration
│   ├── tools/
│   │   ├── vision.ts          # Vision API & Gemini 1.5/2.0 multimodal analysis
│   │   ├── image-gen.ts       # Image Generation (Imagen / Nano Banana)
│   │   ├── voice.ts           # Speech-to-Text (STT) & Text-to-Speech (TTS)
│   │   └── data-agent.ts      # Vertex AI Agent Builder & Data Agent query
│   └── types.ts
└── README.md
```

---

## 4. MCP Server Implementation (TypeScript Example)

Using `@modelcontextprotocol/sdk` and `@google-cloud/*` or `@google/genai`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import vision from "@google-cloud/vision";
import speech from "@google-cloud/speech";
import textToSpeech from "@google-cloud/text-to-speech";
import { GoogleGenAI } from "@google/genai";

const server = new Server(
  {
    name: "ai-kaksha-google-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register Tool List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "vision_analyze_image",
        description: "Analyze an image using Google Cloud Vision or Gemini multimodal model (labels, OCR, object detection, diagram explanations)",
        inputSchema: {
          type: "object",
          properties: {
            imageUri: { type: "string", description: "Public URL or gs:// Cloud Storage URI" },
            imageBase64: { type: "string", description: "Base64-encoded image string" },
            prompt: { type: "string", description: "Prompt or question about the image" },
          },
        },
      },
      {
        name: "speech_transcribe",
        description: "Transcribe audio to text using Google Cloud Speech-to-Text API",
        inputSchema: {
          type: "object",
          properties: {
            audioBase64: { type: "string", description: "Base64 encoded audio bytes" },
            languageCode: { type: "string", default: "en-US", description: "BCP-47 language code" },
            encoding: { type: "string", default: "LINEAR16", description: "Audio encoding format" }
          },
          required: ["audioBase64"],
        },
      },
      {
        name: "voice_synthesize",
        description: "Synthesize speech audio from text using Google Cloud Text-to-Speech API",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text content to speak" },
            voiceName: { type: "string", description: "Voice identifier e.g. en-US-Journey-F or en-IN-Neural2-A" },
            languageCode: { type: "string", default: "en-US" }
          },
          required: ["text"]
        }
      },
      {
        name: "query_google_data_agent",
        description: "Query Google Vertex AI Search & Conversation / Data Agent datastore",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "User query or search phrase" },
            dataStoreId: { type: "string", description: "Vertex AI Search Data Store ID" },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "vision_analyze_image": {
        // Implement Vision API / Gemini multimodal inspection
        return { content: [{ type: "text", text: "Image analysis output..." }] };
      }
      case "speech_transcribe": {
        // Implement Google STT
        return { content: [{ type: "text", text: "Transcribed text..." }] };
      }
      case "voice_synthesize": {
        // Implement Google TTS
        return { content: [{ type: "text", text: "Audio generated successfully (base64 encoded)" }] };
      }
      case "query_google_data_agent": {
        // Implement Vertex AI Data Store search
        return { content: [{ type: "text", text: "Data agent response..." }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
    };
  }
});

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 5. Wiring MCP Server in `.mcp.json`

Add the custom server to `.mcp.json`:

```json
{
  "mcpServers": {
    "angular-cli": {
      "command": "npx",
      "args": ["-y", "@angular/cli", "mcp"]
    },
    "google-cloud-mcp": {
      "command": "node",
      "args": ["./mcp-google-server/dist/index.js"],
      "env": {
        "GCP_PROJECT_ID": "your-gcp-project",
        "GCP_LOCATION": "us-central1",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json"
      }
    }
  }
}
```

---

## 6. Verification & Testing

1. Validate server communication using MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector node ./mcp-google-server/dist/index.js
   ```
2. Verify GCP API quotas and enable necessary APIs:
   ```bash
   gcloud services enable vision.googleapis.com \
                          speech.googleapis.com \
                          texttospeech.googleapis.com \
                          aiplatform.googleapis.com \
                          discoveryengine.googleapis.com
   ```
