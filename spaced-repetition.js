/**
 * spaced-repetition.js — SM-2 間隔重複演算法
 *
 * 核心邏輯：
 * - 答對 → 下次複習間隔加倍（1→2→4→8...天，上限 64 天）
 * - 答錯 → 重置間隔為 1 天，錯誤次數 +1
 * - 複習狀態由 連續答對次數 + 錯誤次數 共同決定
 */

/** 複習狀態常數 */
export const STATUS = {
  UNREVIEWED: '未複習',
  REVIEWING:  '複習中',
  FAMILIAR:   '已熟悉'
};

/**
 * 根據單字資料判斷複習狀態
 * @param {Object} word - 單字資料（含 consecutiveCorrect, errorCount）
 * @returns {string} - '未複習' | '複習中' | '已熟悉'
 */
export function getReviewStatus(word) {
  const errorCount        = word.errorCount        || 0;
  const consecutiveCorrect = word.consecutiveCorrect || 0;

  if (consecutiveCorrect >= 3) {
    return STATUS.FAMILIAR;     // 連續答對 3 次 → 已熟悉
  }
  if (errorCount >= 3 && consecutiveCorrect === 0) {
    return STATUS.REVIEWING;    // 錯很多次還沒連對 → 複習中
  }
  return STATUS.UNREVIEWED;     // 其餘一律視為未複習
}

/**
 * 篩選今日應複習的單字
 * 條件：今日日期 >= 下次複習日期（nextReviewDate）
 *
 * @param {Array} allWords - 所有單字陣列
 * @returns {Array} - 今日需複習的單字（已排序：複習中 > 未複習 > 已熟悉）
 */
export function getTodayWords(allWords) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueWords = allWords.filter((word) => {
    // 沒有 nextReviewDate 視為未複習，應立即複習
    if (!word.nextReviewDate) return true;
    const nextDate = new Date(word.nextReviewDate);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate <= today;
  });

  // 排序：複習中 > 未複習 > 已熟悉
  const priority = {
    [STATUS.REVIEWING]:  0,
    [STATUS.UNREVIEWED]: 1,
    [STATUS.FAMILIAR]:   2
  };

  return dueWords.sort((a, b) => {
    const pa = priority[getReviewStatus(a)] ?? 1;
    const pb = priority[getReviewStatus(b)] ?? 1;
    return pa - pb;
  });
}

/**
 * 記錄一次答題結果，回傳更新後的單字資料
 * （不直接修改原物件，回傳新物件）
 *
 * @param {Object} word - 單字資料
 * @param {boolean} isCorrect - 是否答對
 * @returns {Object} - 更新後的單字資料
 */
export function recordAnswer(word, isCorrect) {
  const now = new Date();

  // 目前的複習間隔（天數），預設 1
  let interval = word.interval || 1;
  let consecutiveCorrect = word.consecutiveCorrect || 0;
  let errorCount         = word.errorCount         || 0;

  if (isCorrect) {
    // 答對：間隔加倍，上限 64 天
    interval = Math.min(interval * 2, 64);
    consecutiveCorrect += 1;
  } else {
    // 答錯：重置間隔，錯誤次數 +1，連續答對歸零
    interval = 1;
    consecutiveCorrect = 0;
    errorCount += 1;
  }

  // 計算下次複習日期
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  // 更新複習狀態
  const updatedWord = {
    ...word,
    interval,
    consecutiveCorrect,
    errorCount,
    nextReviewDate: nextReviewDate.toISOString().split('T')[0],
    lastReviewDate: now.toISOString().split('T')[0]
  };
  updatedWord.reviewStatus = getReviewStatus(updatedWord);

  return updatedWord;
}

/**
 * 計算某個單字距離下次複習還有幾天
 * @param {Object} word
 * @returns {number} - 剩餘天數（負數 = 已過期）
 */
export function daysUntilReview(word) {
  if (!word.nextReviewDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(word.nextReviewDate);
  next.setHours(0, 0, 0, 0);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}
