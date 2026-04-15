/**
 * stats-chart.js — Canvas 長條圖模組（第三階段）
 *
 * 純 Canvas API 實作，不依賴第三方圖表庫
 * 提供：
 * - drawCEFRChart(ctx, words)  — CEFR 等級分布長條圖
 * - drawTopicChart(ctx, words) — 主題分類分布長條圖
 *
 * 設計風格：Catppuccin Mocha 深色主題
 */

// ── 顏色設定 ─────────────────────────────────────────────────
const COLORS = {
  // CEFR 等級顏色
  CEFR: {
    A1: '#a6e3a1',
    A2: '#94e2d5',
    B1: '#89b4fa',
    B2: '#cba6f7',
    C1: '#f9e2af',
    C2: '#f38ba8'
  },
  // 主題分類顏色（依序循環）
  TOPIC_PALETTE: [
    '#cba6f7', '#89b4fa', '#a6e3a1', '#f9e2af',
    '#f38ba8', '#fab387', '#94e2d5', '#b4befe'
  ],
  // 文字與背景
  TEXT:       '#a6adc8',
  GRID:       '#313244',
  BACKGROUND: '#181825'
};

// ── 繪圖工具 ─────────────────────────────────────────────────

/**
 * 計算各欄位的值分布
 * @param {Array} words - 單字陣列
 * @param {string} key  - 欄位名稱
 * @param {string[]} order - 指定排列順序（可選）
 * @returns {{ labels: string[], counts: number[] }}
 */
function countByKey(words, key, order = null) {
  const map = {};
  words.forEach(w => {
    const val = w[key];
    if (val) map[val] = (map[val] || 0) + 1;
  });

  let labels = order
    ? order.filter(k => map[k] !== undefined)
    : Object.keys(map).sort((a, b) => map[b] - map[a]); // 依數量降序

  return {
    labels,
    counts: labels.map(l => map[l] || 0)
  };
}

/**
 * 繪製水平長條圖（通用）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} labels    - Y 軸標籤
 * @param {number[]} values    - 對應數值
 * @param {string|string[]} colors - 填充顏色（單一色或陣列）
 */
function drawBarChart(ctx, labels, values, colors) {
  const canvas  = ctx.canvas;
  const dpr     = window.devicePixelRatio || 1;

  // 高解析度螢幕支援
  const cssW    = canvas.clientWidth  || 400;
  const barH    = 24;
  const padding = { top: 16, right: 50, bottom: 16, left: 72 };
  const rowGap  = 10;
  const totalH  = labels.length * (barH + rowGap) + padding.top + padding.bottom;

  // 設定 Canvas 實體尺寸（高解析度）
  canvas.width  = cssW * dpr;
  canvas.height = totalH * dpr;
  canvas.style.height = totalH + 'px';
  ctx.scale(dpr, dpr);

  const chartW  = cssW - padding.left - padding.right;
  const maxVal  = Math.max(...values, 1); // 避免除以 0

  // 清空背景
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, cssW, totalH);

  labels.forEach((label, i) => {
    const y     = padding.top + i * (barH + rowGap);
    const val   = values[i];
    const barW  = (val / maxVal) * chartW;
    const color = Array.isArray(colors) ? colors[i % colors.length] : colors;

    // ── Y 軸標籤 ──────────────────────────────────
    ctx.fillStyle = COLORS.TEXT;
    ctx.font      = `500 12px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, padding.left - 8, y + barH / 2);

    // ── 背景軌道 ──────────────────────────────────
    ctx.fillStyle     = COLORS.GRID;
    roundRect(ctx, padding.left, y, chartW, barH, 4);
    ctx.fill();

    // ── 數值長條 ──────────────────────────────────
    if (barW > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, padding.left, y, Math.max(barW, 4), barH, 4);
      ctx.fill();
    }

    // ── 數值標籤（長條右側） ──────────────────────
    ctx.fillStyle    = COLORS.TEXT;
    ctx.font         = `600 11px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      val,
      padding.left + chartW + 6,
      y + barH / 2
    );
  });
}

/**
 * 輔助：繪製圓角矩形路徑
 * @param {CanvasRenderingContext2D} ctx
 */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════
// 公開 API
// ══════════════════════════════════════════

/**
 * 繪製 CEFR 等級分布長條圖
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} words - 單字陣列
 */
export function drawCEFRChart(ctx, words) {
  const ORDER  = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const { labels, counts } = countByKey(words, 'cefr', ORDER);

  // 若無資料，顯示提示
  if (labels.length === 0) {
    drawEmptyState(ctx, '尚無資料');
    return;
  }

  const colors = labels.map(l => COLORS.CEFR[l] || '#6c7086');
  drawBarChart(ctx, labels, counts, colors);
}

/**
 * 繪製主題分類分布長條圖
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} words - 單字陣列
 */
export function drawTopicChart(ctx, words) {
  const { labels, counts } = countByKey(words, 'topic');

  if (labels.length === 0) {
    drawEmptyState(ctx, '尚無資料');
    return;
  }

  // 只取前 8 個主題
  const topLabels = labels.slice(0, 8);
  const topCounts = counts.slice(0, 8);

  drawBarChart(ctx, topLabels, topCounts, COLORS.TOPIC_PALETTE);
}

/**
 * 繪製空狀態提示
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} message
 */
function drawEmptyState(ctx, message) {
  const canvas = ctx.canvas;
  canvas.width  = canvas.clientWidth || 400;
  canvas.height = 80;
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle    = COLORS.TEXT;
  ctx.font         = '14px Segoe UI, Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, canvas.width / 2, 40);
}
