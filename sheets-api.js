/**
 * sheets-api.js — Google Sheets API v4 讀寫模組
 *
 * 功能：
 * 1. 從 Sheets 讀取所有單字資料
 * 2. 更新特定單字的複習狀態與錯誤次數
 * 3. 同步資料到 / 從 localStorage（供離線使用）
 */

// ── 設定（部署時更新） ─────────────────────────────────────
const SPREADSHEET_ID = '15Lp_Db59U-iEJaa9IVjnXk7EQGUFnzP8g24xLnoh4kE';
const SHEET_NAME     = '單字庫';
const SHEETS_API     = 'https://sheets.googleapis.com/v4/spreadsheets';
const STORAGE_KEY    = 'vocab_words_cache';
const SYNC_TIME_KEY  = 'vocab_last_sync';

// ── Sheets 欄位索引（A=0, B=1, ...L=11）─────────────────────
const COL = {
  WORD:        0,   // A: 單字
  TRANSLATION: 1,   // B: 中文翻譯
  POS:         2,   // C: 詞性
  SENTENCE:    3,   // D: 例句
  CEFR:        4,   // E: CEFR 等級
  TOEIC:       5,   // F: 多益高頻
  TOPIC:       6,   // G: 主題分類
  FREQ:        7,   // H: 字頻排名
  SOURCE_URL:  8,   // I: 來源 URL
  ADDED_DATE:  9,   // J: 新增日期
  STATUS:      10,  // K: 複習狀態
  ERROR_COUNT: 11   // L: 錯誤次數
};

/**
 * 從 Sheets 讀取所有單字（需 OAuth Token）
 * @param {string} token - OAuth 2.0 Access Token
 * @returns {Promise<Array>} - 單字物件陣列
 */
export async function fetchAllWords(token) {
  const range = encodeURIComponent(`${SHEET_NAME}!A2:L`); // 從第 2 行開始（跳過標題）
  const url   = `${SHEETS_API}/${SPREADSHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`讀取 Sheets 失敗：${res.status}`);
  }

  const data = await res.json();
  const rows = data.values || [];

  // 將每一行轉換為單字物件
  return rows
    .filter(row => row[COL.WORD]?.trim()) // 過濾空行
    .map((row, index) => rowToWord(row, index + 2)); // rowIndex 從 2 開始（對應 Sheets 行號）
}

/**
 * 更新 Sheets 中特定行的複習狀態與錯誤次數
 * @param {string} token     - OAuth Token
 * @param {number} rowIndex  - Sheets 行號（從 2 開始）
 * @param {string} status    - 複習狀態（未複習/複習中/已熟悉）
 * @param {number} errorCount - 錯誤次數
 */
export async function updateWordStatus(token, rowIndex, status, errorCount) {
  // 只更新 K 欄（複習狀態）和 L 欄（錯誤次數）
  const range = encodeURIComponent(`${SHEET_NAME}!K${rowIndex}:L${rowIndex}`);
  const url   = `${SHEETS_API}/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ values: [[status, errorCount]] })
  });

  if (!res.ok) {
    throw new Error(`更新 Sheets 失敗：${res.status}`);
  }
}

/**
 * 將單字陣列存入 localStorage（供離線使用）
 * @param {Array} words - 單字物件陣列
 */
export function syncToLocalStorage(words) {
  try {
    localStorage.setItem(STORAGE_KEY,   JSON.stringify(words));
    localStorage.setItem(SYNC_TIME_KEY, new Date().toISOString());
  } catch (e) {
    console.error('localStorage 寫入失敗（可能已超過 5MB 限制）', e);
  }
}

/**
 * 從 localStorage 讀取快取的單字資料（離線模式）
 * @returns {{ words: Array, lastSync: string|null }}
 */
export function loadFromLocalStorage() {
  try {
    const raw      = localStorage.getItem(STORAGE_KEY);
    const lastSync = localStorage.getItem(SYNC_TIME_KEY);
    const words    = raw ? JSON.parse(raw) : [];
    return { words, lastSync };
  } catch {
    return { words: [], lastSync: null };
  }
}

/**
 * 取得最後同步時間的友善格式
 * @returns {string}
 */
export function getLastSyncText() {
  const lastSync = localStorage.getItem(SYNC_TIME_KEY);
  if (!lastSync) return '尚未同步';
  const date = new Date(lastSync);
  return `${date.toLocaleDateString('zh-TW')} ${date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
}

// ── 內部工具 ──────────────────────────────────────────────────

/**
 * 將 Sheets 一行資料轉換為單字物件
 * @param {Array} row      - 一行的值陣列
 * @param {number} rowIndex - Sheets 行號
 */
function rowToWord(row, rowIndex) {
  return {
    rowIndex,                                              // 對應 Sheets 行號（更新時使用）
    word:        row[COL.WORD]        || '',
    translation: row[COL.TRANSLATION] || '',
    pos:         row[COL.POS]         || '',
    sentence:    row[COL.SENTENCE]    || '',
    cefr:        row[COL.CEFR]        || '',
    toeic:       row[COL.TOEIC]?.toUpperCase() === 'TRUE',
    topic:       row[COL.TOPIC]       || '',
    freq:        row[COL.FREQ]        || '',
    sourceUrl:   row[COL.SOURCE_URL]  || '',
    addedDate:   row[COL.ADDED_DATE]  || '',
    reviewStatus: row[COL.STATUS]     || '未複習',
    errorCount:  parseInt(row[COL.ERROR_COUNT], 10) || 0,
    // SM-2 相關欄位（從 localStorage 補充，Sheets 不儲存這些）
    interval:            null,
    consecutiveCorrect:  0,
    nextReviewDate:      null,
    lastReviewDate:      null
  };
}
