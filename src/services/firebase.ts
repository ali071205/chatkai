class MockAnalytics {
  async logEvent(eventName: string, params?: Record<string, any>) {
    console.log(`[Analytics Mock] Event: ${eventName}`, params ? JSON.stringify(params) : '');
  }
}

class MockCrashlytics {
  recordError(error: Error) {
    console.log(`[Crashlytics Mock] Recorded Error: ${error.message}`);
  }
}

export const analytics = new MockAnalytics();
export const crashlytics = new MockCrashlytics();
