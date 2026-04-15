/**
 * service-worker.js — PWA Service Worker（離線快取 + Web Push）
 *
 * 策略：Cache-First（優先讀取快取，無快取才請求網路）
 * 不快取 Google Sheets API 請求（即時資料）
 */

const CACHE_NAME = 'vocab-review-v1'; // 版本號更新時可清除舊快取

// 需要快取的靜態資源
const STATIC_ASSETS = [
  './',
  './index.html',
  './review.html',
  './dashboard.html',
  './app.js',
  './sheets-api.js',
  './spaced-repetition.js',
  './heatmap.js',
  './stats-chart.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install 事件：預先快取所有靜態資源 ─────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 預先快取靜態資源');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // 跳過等待，立即啟用新版 Service Worker
  self.skipWaiting();
});

// ── Activate 事件：清除舊版快取 ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // 刪除非當前版本的快取
          .map((key) => {
            console.log('[SW] 清除舊快取：', key);
            return caches.delete(key);
          })
      );
    })
  );
  // 立即接管所有分頁
  self.clients.claim();
});

// ── Fetch 事件：Cache-First 策略 ───────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Google Sheets API 與 OAuth 不走快取（需要即時資料）
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('mymemory.translated.net')
  ) {
    return; // 讓瀏覽器直接發出請求
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 有快取 → 直接回傳（同時背景更新快取）
        updateCacheInBackground(event.request);
        return cached;
      }
      // 無快取 → 請求網路並快取結果
      return fetchAndCache(event.request);
    })
  );
});

/** 背景更新快取（Stale-While-Revalidate） */
async function updateCacheInBackground(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch { /* 離線時忽略 */ }
}

/** 請求網路並快取（僅快取成功的 GET 請求） */
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 離線且無快取：回傳基本離線頁面
    const offlinePage = await caches.match('./index.html');
    return offlinePage || new Response('離線中，請稍後再試', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ── Web Push 通知（Android 生效） ──────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const count = data.count || 0;

  const title   = '英語複習提醒 📚';
  const options = {
    body:    count > 0
               ? `你有 ${count} 個單字要複習，點擊開始！`
               : '今天記得複習英語單字哦！',
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-192.png',
    data:    { url: './review.html' },
    actions: [{ action: 'open', title: '開始複習' }],
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 點擊通知 → 開啟複習頁
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './review.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 若 App 已開啟，直接聚焦
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // 否則開啟新視窗
      return clients.openWindow(url);
    })
  );
});
