import { InjectionToken } from '@angular/core';
import { FirebaseEnvironmentConfig } from '../../../environments/environment.interface';
import { environment } from '../../../environments/environment';

export const FIREBASE_CONFIG = new InjectionToken<FirebaseEnvironmentConfig>('FIREBASE_CONFIG', {
  providedIn: 'root',
  factory: () => environment.firebase,
});
