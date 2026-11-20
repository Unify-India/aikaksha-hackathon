import { AppEnvironment } from './environment.interface';

export * from './environment.interface';

export const environment: AppEnvironment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'ai-kaksha-demo.firebaseapp.com',
    projectId: 'ai-kaksha-demo',
    storageBucket: 'ai-kaksha-demo.appspot.com',
    messagingSenderId: '123456789012',
    appId: '1:123456789012:web:abcdef1234567890',
    databaseURL: 'https://ai-kaksha-demo-default-rtdb.firebaseio.com',
  },
  gemini: {
    apiKey: 'YOUR_GEMINI_API_KEY',
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
    serverUrl: 'http://localhost:3000/mcp',
    mode: 'mock',
  },
  features: {
    voiceInput: true,
    reviewGate: true,
    multiChannelPublish: true,
  },
};
