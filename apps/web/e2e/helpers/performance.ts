import type { Page } from "@playwright/test";

type WizardPerfWindow = Window & {
  __wizardLongTaskMs?: number;
  __wizardLongTaskObserver?: PerformanceObserver;
};

export async function startLongTaskObserver(page: Page) {
  await page.evaluate(() => {
    const win = window as WizardPerfWindow;
    win.__wizardLongTaskMs = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        win.__wizardLongTaskMs = (win.__wizardLongTaskMs ?? 0) + entry.duration;
      }
    });
    observer.observe({ type: "longtask", buffered: false });
    win.__wizardLongTaskObserver = observer;
  });
}

export async function stopLongTaskObserver(page: Page) {
  return page.evaluate(() => {
    const win = window as WizardPerfWindow;
    win.__wizardLongTaskObserver?.disconnect();
    win.__wizardLongTaskObserver = undefined;
    return win.__wizardLongTaskMs ?? 0;
  });
}

export async function measureLongTaskMsDuring(page: Page, action: () => Promise<void>) {
  await startLongTaskObserver(page);
  await action();
  await page.waitForTimeout(50);
  return stopLongTaskObserver(page);
}
