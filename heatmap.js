/**
 * heatmap.js — 學習熱力圖（第三階段）
 *
 * 純 JavaScript + SVG 實作，不依賴外部圖表庫
 * 功能：
 * - 讀取 localStorage 中每日複習記錄（vocab_daily_reviews）
 * - 輸出 SVG 格子方塊（過去 30 天）
 * - Hover 顯示日期 + 複習數量 Tooltip
 */

// ── 顏色設定（深色主題 Catppuccin Mauve 系列）───────────────
const HEATMAP_COLORS = {
  0: '#313244',   // 無複習：深灰
  1: '#9b7fca',   // 1~4 次：淡紫
  2: '#b290d4',   // 5~9 次：中紫
  3: '#cba6f7',   // 10~19 次：主紫
  4: '#d4baff'    // 20+ 次：亮紫
};

/**
 * 根據複習次數取得顏色
 * @param {number} count
 * @returns {string} hex 色碼
 */
function getColor(count) {
  if (count === 0)  return HEATMAP_COLORS[0];
  if (count < 5)    return HEATMAP_COLORS[1];
  if (count < 10)   return HEATMAP_COLORS[2];
  if (count < 20)   return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

/**
 * 建立 Tooltip DOM（全域共用一個）
 * @returns {HTMLElement}
 */
function getTooltip() {
  let el = document.getElementById('heatmap-tooltip-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'heatmap-tooltip-el';
    el.className = 'heatmap-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * 取得過去 N 天的日期陣列（從今天往前推）
 * @param {number} days - 天數
 * @returns {string[]} - YYYY-MM-DD 陣列（由遠到近）
 */
function getPastDays(days) {
  const result = [];
  const today  = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

/**
 * 讀取 localStorage 中的每日複習記錄
 * @returns {Object} - { 'YYYY-MM-DD': count }
 */
function loadDailyReviews() {
  try {
    const raw = localStorage.getItem('vocab_daily_reviews');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 格式化日期為友善顯示
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} - 如 '4/14（週一）'
 */
function formatDate(dateStr) {
  const d     = new Date(dateStr + 'T00:00:00');
  const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
}

/**
 * 渲染熱力圖 SVG 到目標容器
 * @param {HTMLElement} container - 目標 DOM 容器
 * @param {number} days           - 顯示天數，預設 30
 */
export function renderHeatmap(container, days = 30) {
  if (!container) return;

  const daily  = loadDailyReviews();
  const dates  = getPastDays(days);
  const tooltip = getTooltip();

  // SVG 尺寸計算
  const cellSize = 20;   // 格子大小（px）
  const gap      = 3;    // 格子間距（px）
  const step     = cellSize + gap;

  // 每行顯示 7 天（一週）
  const cols = Math.ceil(days / 7);
  const rows = 7;

  const svgW = cols * step - gap + 4;  // +4 留邊距
  const svgH = rows * step - gap + 4;

  // 建立 SVG 元素
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width',   svgW);
  svg.setAttribute('height',  svgH);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('role',    'img');
  svg.setAttribute('aria-label', `過去 ${days} 天的學習記錄`);

  // 補齊開頭空格（讓週日對齊第一列）
  const firstDate = new Date(dates[0] + 'T00:00:00');
  const startOffset = firstDate.getDay(); // 0=週日, 6=週六

  dates.forEach((dateStr, i) => {
    const idx  = i + startOffset;         // 考慮補齊偏移
    const col  = Math.floor(idx / 7);
    const row  = idx % 7;
    const x    = col * step + 2;          // +2 左邊距
    const y    = row * step + 2;          // +2 上邊距

    const count = daily[dateStr] || 0;
    const color = getColor(count);

    // 建立格子 <rect>
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x',      x);
    rect.setAttribute('y',      y);
    rect.setAttribute('width',  cellSize);
    rect.setAttribute('height', cellSize);
    rect.setAttribute('rx',     3);
    rect.setAttribute('fill',   color);
    rect.setAttribute('class',  'heatmap-cell');
    rect.setAttribute('data-date',  dateStr);
    rect.setAttribute('data-count', count);

    // Hover 事件：顯示 Tooltip
    rect.addEventListener('mouseenter', (e) => {
      const label = count === 0
        ? `${formatDate(dateStr)}　尚未複習`
        : `${formatDate(dateStr)}　複習 ${count} 個`;
      tooltip.textContent = label;
      tooltip.classList.add('visible');
      moveTooltip(e);
    });

    rect.addEventListener('mousemove', moveTooltip);

    rect.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });

    svg.appendChild(rect);
  });

  // 清空容器後插入 SVG
  container.innerHTML = '';
  container.appendChild(svg);

  // 加上圖例說明
  container.insertAdjacentHTML('beforeend', buildLegend());
}

/** 移動 Tooltip 到滑鼠位置 */
function moveTooltip(e) {
  const tooltip   = getTooltip();
  const offsetX   = 12;
  const offsetY   = -30;
  tooltip.style.left = `${e.clientX + offsetX}px`;
  tooltip.style.top  = `${e.clientY + offsetY}px`;
}

/** 建立圖例 HTML */
function buildLegend() {
  const levels = [
    { label: '0',  color: HEATMAP_COLORS[0] },
    { label: '1+', color: HEATMAP_COLORS[1] },
    { label: '5+', color: HEATMAP_COLORS[2] },
    { label: '10+',color: HEATMAP_COLORS[3] },
    { label: '20+',color: HEATMAP_COLORS[4] }
  ];

  const items = levels.map(l => `
    <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--color-overlay0)">
      <span style="width:12px;height:12px;border-radius:2px;background:${l.color};display:inline-block"></span>
      ${l.label}
    </span>
  `).join('');

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--color-overlay0)">少</span>
      ${items}
      <span style="font-size:11px;color:var(--color-overlay0)">多</span>
    </div>
  `;
}
