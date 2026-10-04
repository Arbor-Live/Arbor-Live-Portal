/* Arbor Live service worker: Web Push only (no offline caching). */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Payload is built in packages/backend/convex/pushDelivery.ts.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Arbor Live" };
  }
  const title = data.title || "Arbor Live";
  const tasks = [
    self.registration.showNotification(title, {
      body: data.body || undefined,
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { path: data.path || "/dashboard" },
    }),
  ];
  if (typeof data.unreadCount === "number" && "setAppBadge" in self.navigator) {
    tasks.push(self.navigator.setAppBadge(data.unreadCount).catch(() => undefined));
  }
  event.waitUntil(Promise.all(tasks));
});

// Focus an open portal window and route it, else open a new one. Visiting the
// page marks the notification read (NotificationAutoRead).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/dashboard";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) return existing.navigate(url);
        return undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
