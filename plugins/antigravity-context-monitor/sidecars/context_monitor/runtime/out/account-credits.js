"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurrentCreditType = isCurrentCreditType;
exports.parseCreditBalance = parseCreditBalance;
exports.formatCreditTypeLabel = formatCreditTypeLabel;
exports.currentAICredits = currentAICredits;
exports.aiCreditTotal = aiCreditTotal;
exports.summarizeAccountCredits = summarizeAccountCredits;
const billing_day_1 = require("./billing-day");
const i18n_1 = require("./i18n");
const IGNORED_CREDIT_TYPES = new Set([
    '',
    'UNSPECIFIED',
    'PROMPT',
    'FLOW',
    'PROMPT_CREDITS',
    'FLOW_CREDITS',
]);
function creditKey(type) {
    return type.trim().toUpperCase().replace(/^CREDIT_TYPE_/, '');
}
function isCurrentCreditType(type) {
    return !IGNORED_CREDIT_TYPES.has(creditKey(type));
}
function parseCreditBalance(value) {
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) {
        value = Number(value);
    }
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function formatCreditTypeLabel(creditType) {
    const key = creditKey(creditType);
    const labelMap = {
        GOOGLE_ONE_AI: ['Google AI credits', 'Google AI 积分'],
        GOOGLE_AI: ['Google AI credits', 'Google AI 积分'],
        GOOGLE_AI_STUDIO: ['Google AI Studio credits', 'Google AI Studio 积分'],
    };
    const mapped = Object.hasOwn(labelMap, key) ? labelMap[key] : undefined;
    if (mapped) {
        return (0, i18n_1.tBi)(mapped[0], mapped[1]);
    }
    return key ? key.replace(/_/g, ' ') : (0, i18n_1.tBi)('AI credits', 'AI 积分');
}
function currentAICredits(credits) {
    const byType = new Map();
    for (const entry of credits) {
        const key = creditKey(entry.creditType);
        if (!isCurrentCreditType(entry.creditType)) {
            continue;
        }
        const balance = parseCreditBalance(entry.creditAmount);
        const existing = byType.get(key);
        if (!existing) {
            byType.set(key, { ...entry, creditType: key, creditAmount: balance });
        }
        else if (existing.creditAmount !== balance) {
            // Repeated equal balances are one bucket. Conflicting readings are ambiguous.
            byType.set(key, { ...existing, creditAmount: null });
        }
    }
    return [...byType.values()];
}
function aiCreditTotal(credits) {
    const current = currentAICredits(credits);
    if (!current.length || current.some(entry => entry.creditAmount === null)) {
        return null;
    }
    const total = current.reduce((sum, entry) => sum + (entry.creditAmount ?? 0), 0);
    return Number.isFinite(total) ? total : null;
}
function summarizeAccountCredits(credits, billingDay = 0, now = new Date()) {
    const entries = currentAICredits(credits);
    const total = aiCreditTotal(entries);
    const normalizedBillingDay = Number.isInteger(billingDay) && billingDay >= 1 && billingDay <= 31 ? billingDay : 0;
    return {
        entries,
        total,
        known: total !== null,
        billingDay: normalizedBillingDay,
        daysUntilExpiry: (0, billing_day_1.getDaysUntilBillingDay)(normalizedBillingDay, now),
    };
}
//# sourceMappingURL=account-credits.js.map