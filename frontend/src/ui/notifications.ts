// Notification system for user feedback

import { useNotifications, useActions } from "../stores/deviceStore";
import type { Notification } from "../types/models";

export function createNotificationSystem(): void {
  const container = document.createElement("div");
  container.id = "notification-container";
  container.className = "notification-container";
  document.body.appendChild(container);

  // Style the notification container
  const style = document.createElement("style");
  style.textContent = `
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 400px;
      pointer-events: none;
    }

    .notification {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-bottom: 12px;
      padding: 16px;
      pointer-events: auto;
      transform: translateX(100%);
      transition: all 0.3s ease;
      border-left: 4px solid #ccc;
    }

    .notification.show {
      transform: translateX(0);
    }

    .notification.info {
      border-left-color: #3b82f6;
    }

    .notification.success {
      border-left-color: #10b981;
    }

    .notification.warning {
      border-left-color: #f59e0b;
    }

    .notification.error {
      border-left-color: #ef4444;
    }

    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .notification-type {
      font-weight: 600;
      text-transform: capitalize;
      font-size: 14px;
    }

    .notification-close {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notification-close:hover {
      color: #374151;
    }

    .notification-message {
      color: #374151;
      font-size: 14px;
      line-height: 1.4;
    }

    .notification-time {
      color: #6b7280;
      font-size: 12px;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}

export function renderNotifications(): void {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const notifications = useNotifications();
  const { removeNotification } = useActions();

  // Clear existing notifications
  container.innerHTML = "";

  // Render each notification
  notifications.forEach((notification) => {
    const element = createNotificationElement(notification, removeNotification);
    container.appendChild(element);

    // Trigger show animation
    requestAnimationFrame(() => {
      element.classList.add("show");
    });
  });
}

function createNotificationElement(
  notification: Notification,
  onRemove: (id: string) => void
): HTMLElement {
  const element = document.createElement("div");
  element.className = `notification ${notification.type}`;

  const timeAgo = getTimeAgo(notification.timestamp);

  element.innerHTML = `
    <div class="notification-header">
      <span class="notification-type">${notification.type}</span>
      <button class="notification-close" data-id="${notification.id}">×</button>
    </div>
    <div class="notification-message">${escapeHtml(notification.message)}</div>
    <div class="notification-time">${timeAgo}</div>
  `;

  // Add click handler for close button
  const closeBtn = element.querySelector(".notification-close") as HTMLButtonElement;
  const removeNotification = () => {
    element.classList.remove("show");
    setTimeout(() => {
      onRemove(notification.id);
    }, 300); // Wait for animation
  };

  closeBtn.addEventListener("click", removeNotification);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    // Check if notification still exists (user hasn't manually closed it)
    if (element.parentNode) {
      removeNotification();
    }
  }, 5000);

  return element;
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Auto-update notification timestamps
setInterval(() => {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const timeElements = container.querySelectorAll(".notification-time");
  const notifications = useNotifications();

  timeElements.forEach((element, index) => {
    const notification = notifications[index];
    if (notification) {
      element.textContent = getTimeAgo(notification.timestamp);
    }
  });
}, 30000); // Update every 30 seconds
