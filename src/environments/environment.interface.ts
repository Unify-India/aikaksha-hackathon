export interface FirebaseEnvironmentConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL?: string;
}

export interface GeminiEnvironmentConfig {
  apiKey: string;
  model: 'gemini-2.5-flash' | 'gemini-1.5-pro' | string;
  endpoint: string;
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

export interface AppEnvironment {
  production: boolean;
  firebase: FirebaseEnvironmentConfig;
  gemini: GeminiEnvironmentConfig;
  mcp: McpEnvironmentConfig;
  features: FeatureFlagsEnvironmentConfig;
}
