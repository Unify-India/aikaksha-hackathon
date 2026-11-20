import { AppEnvironment } from './environment.interface';

export * from './environment.interface';

export const environment: AppEnvironment = {
  production: false,
  // Firebase web config for project abhyas-unify. Public by design (restrict the key to your
  // domains in Google Cloud console); Firestore access is still denied by firestore.rules.
  firebase: {
    apiKey: 'AIzaSyBYN7lRG4rHeuQkHvHu_hii_xFzTI8d-88',
    authDomain: 'abhyas-unify.firebaseapp.com',
    projectId: 'abhyas-unify',
    storageBucket: 'abhyas-unify.firebasestorage.app',
    messagingSenderId: '629153546558',
    appId: '1:629153546558:web:d477d43a7aea25a444ac6f',
    measurementId: 'G-K9096T7FSH',
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
