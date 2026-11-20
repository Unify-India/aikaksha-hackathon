import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  durationMs?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly _notifications = signal<AppNotification[]>([]);
  public readonly notifications = this._notifications.asReadonly();

  public show(
    type: NotificationType,
    title: string,
    message: string,
    durationMs = 4000
  ): string {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const notification: AppNotification = {
      id,
      type,
      title,
      message,
      timestamp: Date.now(),
      durationMs,
    };

    this._notifications.update((items) => [...items, notification]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }

    return id;
  }

  public success(title: string, message: string): string {
    return this.show('success', title, message);
  }

  public info(title: string, message: string): string {
    return this.show('info', title, message);
  }

  public warning(title: string, message: string): string {
    return this.show('warning', title, message, 6000);
  }

  public error(title: string, message: string): string {
    return this.show('error', title, message, 8000);
  }

  public dismiss(id: string): void {
    this._notifications.update((items) => items.filter((n) => n.id !== id));
  }

  public clear(): void {
    this._notifications.set([]);
  }
}
