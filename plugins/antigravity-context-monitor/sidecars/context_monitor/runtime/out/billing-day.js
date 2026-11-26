"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBillingDay = isBillingDay;
exports.isBillingDaySetting = isBillingDaySetting;
exports.getDaysUntilBillingDay = getDaysUntilBillingDay;
const DAY_MS = 24 * 60 * 60 * 1000;
function isBillingDay(day) {
    return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
}
function isBillingDaySetting(day) {
    return typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 31;
}
function getDaysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
/**
 * Calculate the date-only delta to the next billing day.
 * Uses UTC calendar midnights to avoid DST hour shifts changing the day count.
 */
function getDaysUntilBillingDay(billingDay, now = new Date()) {
    if (!isBillingDay(billingDay)) {
        return null;
    }
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const todayUtc = Date.UTC(year, month, today);
    const currentDay = Math.min(billingDay, getDaysInMonth(year, month));
    const currentTargetUtc = Date.UTC(year, month, currentDay);
    if (todayUtc <= currentTargetUtc) {
        return Math.round((currentTargetUtc - todayUtc) / DAY_MS);
    }
    const nextMonth = new Date(year, month + 1, 1);
    const nextYear = nextMonth.getFullYear();
    const nextMonthIndex = nextMonth.getMonth();
    const nextDay = Math.min(billingDay, getDaysInMonth(nextYear, nextMonthIndex));
    const nextTargetUtc = Date.UTC(nextYear, nextMonthIndex, nextDay);
    return Math.round((nextTargetUtc - todayUtc) / DAY_MS);
}
//# sourceMappingURL=billing-day.js.map