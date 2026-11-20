import { Injectable, signal, computed } from '@angular/core';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'teacher' | 'admin' | 'student';
  tenantId: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _currentUser = signal<AuthUser | null>({
    uid: 'teacher-sharma-101',
    email: 'r.sharma@kaksha.institute.in',
    displayName: 'Prof. R. Sharma (Physics Dept)',
    role: 'teacher',
    tenantId: 'institute-alpha-delhi',
  });

  public readonly currentUser = this._currentUser.asReadonly();
  public readonly isAuthenticated = computed(() => this._currentUser() !== null);
  public readonly teacherId = computed(() => this._currentUser()?.uid ?? '');
  public readonly tenantId = computed(() => this._currentUser()?.tenantId ?? '');

  public loginAsMockTeacher(uid = 'teacher-sharma-101', displayName = 'Prof. R. Sharma'): void {
    this._currentUser.set({
      uid,
      email: `${uid}@kaksha.institute.in`,
      displayName,
      role: 'teacher',
      tenantId: 'institute-alpha-delhi',
    });
  }

  public logout(): void {
    this._currentUser.set(null);
  }
}
