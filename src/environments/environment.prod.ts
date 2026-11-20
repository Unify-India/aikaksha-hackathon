import { AppEnvironment } from './environment.interface';

export * from './environment.interface';

export const environment: AppEnvironment = {
  production: true,
  firebase: {
    apiKey: 'YOUR_PRODUCTION_FIREBASE_API_KEY',
    authDomain: 'ai-kaksha.firebaseapp.com',
    projectId: 'ai-kaksha-prod',
    storageBucket: 'ai-kaksha-prod.appspot.com',
    messagingSenderId: '987654321098',
    appId: '1:987654321098:web:prodabcdef12345678',
    databaseURL: 'https://ai-kaksha-prod-default-rtdb.firebaseio.com',
  },
  gemini: {
    apiKey: 'YOUR_PRODUCTION_GEMINI_API_KEY',
    model: 'gemini-2.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    liveModel: 'gemini-3.8-live',
  },
  examApi: {
    baseUrl: 'https://asia-south1-abhyas-unify.cloudfunctions.net/api',
    demoToken: 'demo-teacher-token-alpha',
    tenantId: 'institute-alpha-delhi',
  },
  mcp: {
    serverUrl: 'https://api.ai-kaksha.internal/mcp',
    mode: 'live',
  },
  features: {
    voiceInput: true,
    reviewGate: true,
    multiChannelPublish: true,
  },
};
