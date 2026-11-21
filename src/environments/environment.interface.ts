export interface FirebaseEnvironmentConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL?: string;
  measurementId?: string;
}

export interface GeminiEnvironmentConfig {
  apiKey: string;
  model: 'gemini-2.5-flash' | 'gemini-1.5-pro' | string;
  endpoint: string;
  /** Gemini Live (bidiGenerateContent) model with native audio, used by the Voice Copilot. */
  liveModel: string;
  /**
   * Optional keys the teacher can pick for Voice Copilot question generation (key picker and quota
   * buttons). Set only in local, uncommitted environment files; never commit key values.
   */
  questionKeys?: { id: string; label: string; apiKey: string }[];
}

export interface McpEnvironmentConfig {
  serverUrl: string;
  mode: 'mock' | 'live';
}

export interface FeatureFlagsEnvironmentConfig {
  voiceInput: boolean;
  reviewGate: boolean;
  multiChannelPublish: boolean;
}

/** Exam creation REST API (docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md). */
export interface ExamApiEnvironmentConfig {
  /** Cloud Function base, e.g. https://us-central1-<project>.cloudfunctions.net/api (routes add /api/...). */
  baseUrl: string;
  /** Demo bearer token accepted by functions/src/auth/middleware.ts; replace with a Firebase ID token later. */
  demoToken: string;
  tenantId: string;
}

export interface AppEnvironment {
  production: boolean;
  firebase: FirebaseEnvironmentConfig;
  gemini: GeminiEnvironmentConfig;
  mcp: McpEnvironmentConfig;
  examApi: ExamApiEnvironmentConfig;
  features: FeatureFlagsEnvironmentConfig;
}
