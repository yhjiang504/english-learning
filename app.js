/**
 * app.js — PWA 主邏輯（初始化 + OAuth + 同步）
 *
 * 功能：
 * 1. Google OAuth 2.0 登入流程（Implicit Grant）
 * 2. 登入後自動同步 Sheets 資料到 localStorage
 * 3. 管理全域狀態（token、words、今日複習清單）
 * 4. 提供 showToast() 等全域工具函式
 * 5. 注冊 Service Worker
 */

import { fetchAllWords, syncToLocalStorage, loadFromLocalStorage, getLastSyncText } from './sheets-api.js';
import { getTodayWords } from './spaced-repetition.js';

// ── 設定區（部署時更新） ─────────────────────────────────
// Google Cloud Console → OAuth 2.0 用戶端 ID（Web 應用程式類型）
const GOOGLE_CLIENT_ID   = '185112442093-cd2tsfhdab9kho7ed807kgrobdosdvit.apps.googleusercontent.com';
// GitHub Pages 部署後的網址（需加入 OAuth 授權重新導向 URI）
const REDIRECT_URI       = 'https://yhjiang504.github.io/english-learning/';
// Google OAuth 授權端點
const OAUTH_ENDPOINT     = 'https://accounts.google.com/o/oauth2/v2/auth';
// 需要的 API 範圍
const SCOPES             = 'https://www.googleapis.com/auth/spreadsheets';

// ── 全域狀態 ────────────────────────────────────────────
export const state = {
  token:      null,     // OAuth Access Token
  allWords:   [],       // 所有單字
  todayWords: [],       // 今日複習清單
  isOnline:   navigator.onLine
};

// ══════════════════════════════════════════
// 初始化（所有頁面都會執行）
// ══════════════════════════════════════════
export async function initApp() {
  // 1. 注冊 Service Worker（PWA 離線支援）
  await registerServiceWorker();

  // 2. 嘗試從 URL hash 取得 OAuth token（Implicit Grant 回呼）
  const tokenFromHash = extractTokenFromHash();
  if (tokenFromHash) {
    state.token = tokenFromHash;
    saveToken(tokenFromHash);
    // 清除 URL hash（避免書籤留存 token）
    history.replaceState(null, '', window.location.pathname);
  } else {
    // 從 sessionStorage 還原 token
    state.token = loadToken();
  }

  // 3. 載入單字資料
  await loadWords();

  // 4. 監聽網路狀態
  window.addEventListener('online',  () => { state.isOnline = true;  showToast('網路已恢復', 'success'); });
  window.addEventListener('offline', () => { state.isOnline = false; showToast('已進入離線模式，使用快取資料', 'warning'); });
}

// ══════════════════════════════════════════
// OAuth 2.0 登入（Implicit Grant）
// ══════════════════════════════════════════

/**
 * 跳轉到 Google 登入頁
 */
export function loginWithGoogle() {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'token',
    scope:         SCOPES,
    prompt:        'select_account'
  });
  window.location.href = `${OAUTH_ENDPOINT}?${params}`;
}

/**
 * 從 URL hash 提取 access_token（Implicit Grant 回呼）
 * @returns {string|null}
 */
function extractTokenFromHash() {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get('access_token') || null;
}

/** 儲存 token 到 sessionStorage（關閉分頁即清除） */
function saveToken(token) {
  sessionStorage.setItem('oauth_token', token);
}

/** 從 sessionStorage 讀取 token */
function loadToken() {
  return sessionStorage.getItem('oauth_token');
}

/** 清除 token（登出） */
export function logout() {
  sessionStorage.removeItem('oauth_token');
  state.token = null;
  showToast('已登出', 'success');
  setTimeout(() => { window.location.reload(); }, 800);
}

/** 是否已登入 */
export function isLoggedIn() {
  return !!state.token;
}

// ══════════════════════════════════════════
// 資料同步
// ══════════════════════════════════════════

/**
 * 載入單字資料
 * 優先使用 localStorage 快取；若已登入則嘗試同步最新資料
 */
export async function loadWords() {
  // 先載入快取（確保離線時有資料）
  const { words: cached } = loadFromLocalStorage();
  if (cached.length > 0) {
    state.allWords   = mergeLocalProgress(cached);
    state.todayWords = getTodayWords(state.allWords);
  }

  // 若已登入且在線，嘗試同步最新資料
  if (state.token && state.isOnline) {
    await syncFromSheets(false); // false = 靜默同步（不顯示 toast）
  }
}

/**
 * 從 Google Sheets 同步最新資料
 * @param {boolean} showFeedback - 是否顯示 toast 提示
 */
export async function syncFromSheets(showFeedback = true) {
  if (!state.token) {
    showToast('請先登入 Google 帳號', 'warning');
    return;
  }

  try {
    if (showFeedback) showToast('同步中...', 'info');

    const freshWords = await fetchAllWords(state.token);

    // 合併本地的 SM-2 進度（nextReviewDate 等）到新資料
    const merged = mergeLocalProgress(freshWords);
    state.allWords   = merged;
    state.todayWords = getTodayWords(merged);

    syncToLocalStorage(merged);

    if (showFeedback) {
      showToast(`同步完成！共 ${merged.length} 個單字`, 'success');
    }

    // 觸發頁面更新（各頁面監聽此事件）
    window.dispatchEvent(new CustomEvent('words-updated', { detail: { words: merged } }));

  } catch (err) {
    console.error('同步失敗', err);
    if (showFeedback) showToast(`同步失敗：${err.message}`, 'error');

    // token 可能過期，清除後要求重新登入
    if (err.message.includes('401')) {
      logout();
    }
  }
}

/**
 * 合併本地 SM-2 進度到 Sheets 資料
 * Sheets 只存「複習狀態」欄位，SM-2 細節（interval、nextReviewDate）存在 localStorage
 */
function mergeLocalProgress(newWords) {
  const localRaw = localStorage.getItem('vocab_sm2_progress');
  const progress = localRaw ? JSON.parse(localRaw) : {};

  return newWords.map(word => {
    const saved = progress[word.word] || {};
    return { ...word, ...saved };
  });
}

/**
 * 儲存單一單字的 SM-2 進度到 localStorage
 * @param {Object} word - 更新後的單字物件
 */
export function saveWordProgress(word) {
  const localRaw = localStorage.getItem('vocab_sm2_progress');
  const progress = localRaw ? JSON.parse(localRaw) : {};

  progress[word.word] = {
    interval:            word.interval,
    consecutiveCorrect:  word.consecutiveCorrect,
    errorCount:          word.errorCount,
    nextReviewDate:      word.nextReviewDate,
    lastReviewDate:      word.lastReviewDate,
    reviewStatus:        word.reviewStatus
  };

  localStorage.setItem('vocab_sm2_progress', JSON.stringify(progress));

  // 同時更新每日複習記錄（用於熱力圖）
  recordDailyReview();
}

/**
 * 記錄今日複習次數（熱力圖資料）
 */
function recordDailyReview() {
  const today = new Date().toISOString().split('T')[0];
  const raw   = localStorage.getItem('vocab_daily_reviews') || '{}';
  const daily = JSON.parse(raw);
  daily[today] = (daily[today] || 0) + 1;
  localStorage.setItem('vocab_daily_reviews', JSON.stringify(daily));
}

// ══════════════════════════════════════════
// Service Worker
// ══════════════════════════════════════════
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    console.log('[App] Service Worker 已注冊', reg.scope);
  } catch (err) {
    console.error('[App] Service Worker 注冊失敗', err);
  }
}

// ══════════════════════════════════════════
// Toast 通知（全域工具）
// ══════════════════════════════════════════

/**
 * 顯示 Toast 通知
 * @param {string} message  - 訊息文字
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - 顯示毫秒數（預設 3000）
 */
export function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ══════════════════════════════════════════
// Android Web Push 訂閱
// ══════════════════════════════════════════

/**
 * 請求通知權限並訂閱 Web Push（僅 Android Chrome 有效）
 * iOS 不支援 Web Push 兼容模式，由 index.html 的 Banner 取代
 */
export async function requestPushPermission() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    showToast('此裝置不支援推播通知', 'warning');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    showToast('✅ 推播通知已開啟', 'success');
  } else {
    showToast('推播通知已被拒絕，可在瀏覽器設定中開啟', 'warning');
  }
}
