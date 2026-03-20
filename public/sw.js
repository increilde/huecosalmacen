/* global self, clients */
// Simple Service Worker to handle notifications
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Try to focus the window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('push', function() {
  // Handle push if needed in future
});
