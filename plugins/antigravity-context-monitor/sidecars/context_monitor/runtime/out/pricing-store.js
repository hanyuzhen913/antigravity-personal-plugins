"use strict";
// ─── Pricing Store ───────────────────────────────────────────────────────────
// Manages model pricing data: default built-in prices, user custom overrides
// persisted via globalState, lookup helpers, and cost calculation.
//
// Extracted from gm-panel.ts to enable the dedicated Pricing tab.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingStore = exports.ORCHESTRATOR_BASE_PRICE_MAP = exports.DEFAULT_PRICING = exports.PRICING_LAST_UPDATED = void 0;
exports.normalizeOrchestratorPricingMode = normalizeOrchestratorPricingMode;
exports.getOrchestratorPricingMode = getOrchestratorPricingMode;
exports.setOrchestratorPricingMode = setOrchestratorPricingMode;
exports.getOrchestratorBaseMapping = getOrchestratorBaseMapping;
exports.findPricing = findPricing;
exports.findPricingWithCustom = findPricingWithCustom;
exports.findPricingForDate = findPricingForDate;
exports.resolvePricingDetail = resolvePricingDetail;
exports.getUpcomingRateChanges = getUpcomingRateChanges;
exports.getUpcomingRateChangeForModel = getUpcomingRateChangeForModel;
exports.costFromTokens = costFromTokens;
exports.samePricingModel = samePricingModel;
exports.selectPricingModel = selectPricingModel;
exports.calculateUsageCosts = calculateUsageCosts;
exports.calculateLedgerModelCosts = calculateLedgerModelCosts;
exports.calculateCosts = calculateCosts;
exports.formatUsdCost = formatUsdCost;
exports.formatUsdSavings = formatUsdSavings;
exports.formatUsdPerMillion = formatUsdPerMillion;
const models_1 = require("./models");
// ─── Default Pricing Table (per 1M tokens, USD) ─────────────────────────────
// Source: https://platform.claude.com/docs/en/about-claude/pricing
//         https://aistudio.google.com/docs/pricing
//         https://cloud.google.com/vertex-ai/generative-ai/pricing
//         https://cloud.google.com/model-garden/partner-models/pricing
// Verified 2026-11-22: Gemini 4 Neon ($3/$15/$0.15/$0), Claude Sonnet 5.5 cacheRead ($0.10),
//                      Gemini 3.6 Flash bounded promo (2026-08-13 through 2026-12-31).
// Cache: Claude cacheWrite uses the official 5-minute TTL rate; reads are model-specific.
//        Gemini cacheRead = from official table; Gemini 4 uses implicit caching only ($0 write).
// Thinking: = output price (Claude extended thinking / Gemini reasoning output)
exports.PRICING_LAST_UPDATED = '2026-11-22';
const NEON_PRICING = { input: 3, output: 15, cacheRead: 0.15, cacheWrite: 0, thinking: 15 };
const CARBON_RATE_CHANGE = Date.parse('2026-12-01T00:00:00Z');
const CARBON_INTRO_PRICING = { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 0, thinking: 10 };
const CARBON_STANDARD_PRICING = { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 0, thinking: 20 };
const ARGON_RATE_CHANGE = Date.parse('2026-12-01T00:00:00Z');
const ARGON_INTRO_PRICING = { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 0, thinking: 10 };
const ARGON_STANDARD_PRICING = { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 0, thinking: 20 };
const FLASH_RATE_CHANGE = Date.parse('2027-01-01T00:00:00Z');
const FLASH_INTRO_PRICING = { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.9375, thinking: 3.75 };
const FLASH_STANDARD_PRICING = { input: 1.50, output: 7.50, cacheRead: 0.15, cacheWrite: 1.875, thinking: 7.50 };
const FLASH36_PROMO_START = Date.parse('2026-08-13T00:00:00Z');
const FLASH36_INTRO_PRICING = { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.9375, thinking: 3.75 };
const FLASH36_STANDARD_PRICING = { input: 1.50, output: 7.50, cacheRead: 0.15, cacheWrite: 1.875, thinking: 7.50 };
/** Calendar-only archive keys keep their stored day; full timestamps use UTC. */
function pricingTimestamp(at) {
    if (at instanceof Date) {
        return Number.isFinite(at.getTime()) ? at.getTime() : null;
    }
    if (typeof at === 'number') {
        return Number.isFinite(at) && Number.isFinite(new Date(at).getTime()) ? at : null;
    }
    if (!/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/i.test(at)) {
        return null;
    }
    const day = at.slice(0, 10);
    const dayTime = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== day) {
        return null;
    }
    const timestamp = Date.parse(at);
    return Number.isFinite(timestamp) ? timestamp : null;
}
exports.DEFAULT_PRICING = {
    // https://aistudio.google.com/docs/whats-new-gemini-4-neon & https://cloud.google.com/vertex-ai/generative-ai/pricing (2026-11-22).
    // Standard API reference, flat across full 1M context, all four efforts. No scheduled cutover;
    // implicit cache reads only (95% off, $0.15); explicit cache-control write ($3.75 on Vertex AI) not effective until 2027-01-12.
    'gemini-4-neon': NEON_PRICING,
    // https://aistudio.google.com/docs/pricing#gemini-4-hydrogen (2026-11-13, re-verified 2026-11-22).
    // Standard API reference, all four efforts. No published scheduled cutover;
    // implicit cache reads only, no explicit caching or cache-write charge.
    'gemini-4-hydrogen': { input: 1.50, output: 7.50, cacheRead: 0.075, cacheWrite: 0, thinking: 7.50 },
    // Carbon has its own verified schedule, independent of Argon's equal rates.
    // https://aistudio.google.com/docs/pricing#gemini-4-carbon (2026-11-11, re-verified 2026-11-22).
    // Standard API reference; implicit cache reads only, no explicit cache writes.
    get 'gemini-4-carbon'() { return Date.now() < CARBON_RATE_CHANGE ? CARBON_INTRO_PRICING : CARBON_STANDARD_PRICING; },
    // Google standard API reference, not Batch/Flex/Priority or subscription credits.
    // https://ai.google.dev/gemini-api/docs/pricing#gemini-4-argon (2026-10-31, re-verified 2026-11-22).
    // Implicit cache reads only; explicit caching/cache-write fees are unsupported.
    get 'gemini-4-argon'() { return Date.now() < ARGON_RATE_CHANGE ? ARGON_INTRO_PRICING : ARGON_STANDARD_PRICING; },
    // ── Claude (platform.claude.com/docs/en/about-claude/pricing) ─────
    'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.50, cacheWrite: 6.25, thinking: 25 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, thinking: 15 },
    // https://platform.claude.com/docs/en/about-claude/pricing & Anthropic rate card PDF (2026-10-07, re-verified 2026-11-22), all effort tiers.
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5, thinking: 20 },
    // https://platform.claude.com/docs/en/about-claude/pricing, https://www.anthropic.com/claude-sonnet-5-5,
    // Anthropic rate card PDF (2026-10-07), and https://cloud.google.com/model-garden/partner-models/pricing (verified 2026-11-22).
    // Cache read is 0.05× input ($0.10/1M), half of Sonnet 5's $0.20/1M.
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 2.50, thinking: 10 },
    // ── GPT-OSS (cloud.google.com/model-garden/partner-models/pricing) ─
    'gpt-oss-120b': { input: 0.09, output: 0.36, cacheRead: 0, cacheWrite: 0, thinking: 0.36 },
    // ── Gemini 3.x (cloud.google.com/vertex-ai/generative-ai/pricing) ─
    'gemini-3.1-pro': { input: 2, output: 12, cacheRead: 0.20, cacheWrite: 2.50, thinking: 12 },
    'gemini-3-flash': { input: 0.50, output: 3, cacheRead: 0.05, cacheWrite: 0.625, thinking: 3 }, // Gemini 3 Flash (M133=gemini-3-flash-b)
    // ── Gemini 3.5 Flash (ai.google.dev/gemini-api/docs/pricing) ────────
    'gemini-3.5-flash': { input: 1.50, output: 9, cacheRead: 0.15, cacheWrite: 1.875, thinking: 9 },
    // ── Gemini 3.6 Flash (aistudio.google.com/docs/pricing#gemini-3.6-flash + Vertex AI, verified 2026-11-22) ──
    // Bounded promotional pricing: $0.75 input / $3.75 output / $0.075 cacheRead from 2026-08-13 through 2026-12-31 UTC;
    // standard $1.50 / $7.50 / $0.15 applies before 2026-08-13 and starting 2027-01-01 UTC.
    get 'gemini-3.6-flash'() {
        const now = Date.now();
        return now >= FLASH36_PROMO_START && now < FLASH_RATE_CHANGE
            ? FLASH36_INTRO_PRICING : FLASH36_STANDARD_PRICING;
    },
    // ── Gemini 3.7 Flash (blog.google introduction post + AI Studio + Vertex AI, re-verified 2026-11-22) ──
    // INTRODUCTORY pricing, exactly half of standard: $0.75 input / $3.75 output per 1M tokens,
    // context caching $0.075. Google's footnote: "Introductory pricing expires on December 31, 2026.
    // Starting January 1, 2027, $1.50/1M input tokens and $7.50/1M output tokens will apply."
    // The getter rolls to the published post-introductory rate automatically;
    // dated calls retain their introductory rate during historical calculations.
    // cacheWrite derived at 1.25× input, consistent with how the 3.5/3.6 Flash rows were derived.
    get 'gemini-3.7-flash'() { return Date.now() < FLASH_RATE_CHANGE ? FLASH_INTRO_PRICING : FLASH_STANDARD_PRICING; },
    // ── Gemini 3.8 Flash (aistudio.google.com/docs/pricing#gemini-3.8-flash + Vertex AI, re-verified 2026-11-22) ──
    // Same introductory rate and expiry as 3.7 Flash: $0.75 input / $3.75 output through 2026-12-31;
    // from 2027-01-01 the rates become $1.50 / $7.50. Cache rates follow the existing Flash policy.
    get 'gemini-3.8-flash'() { return Date.now() < FLASH_RATE_CHANGE ? FLASH_INTRO_PRICING : FLASH_STANDARD_PRICING; },
};
// ─── Orchestrator Base-Model Mapping & Mode ──────────────────────────────────
// Legacy fixed-route Orchestrator placeholder IDs have no standalone published
// API rate card, but execute on verified Gemini 4 base families (live LS 2.34.0
// confirms M669 shares base MODEL_PLACEHOLDER_M432 with Gemini 4 Hydrogen).
// In default 'mapped' mode, these 4 verified IDs resolve to their base family's
// rates (honoring UTC dated cutovers and letting user custom overrides win).
// In 'strict' mode, they stay unpriced unless explicitly custom-overridden.
exports.ORCHESTRATOR_BASE_PRICE_MAP = {
    MODEL_PLACEHOLDER_M537: {
        placeholderId: 'MODEL_PLACEHOLDER_M537',
        catalogId: 'gemini-pro-orchestrator-neon',
        baseKey: 'gemini-4-neon',
        baseLabel: 'Gemini 4 Neon',
        note: 'Maps Orchestrator (Neon) to Gemini 4 Neon base rates.',
    },
    MODEL_PLACEHOLDER_M667: {
        placeholderId: 'MODEL_PLACEHOLDER_M667',
        catalogId: 'gemini-pro-orchestrator',
        baseKey: 'gemini-4-carbon',
        baseLabel: 'Gemini 4 Carbon',
        note: 'Maps Orchestrator (Carbon) to Gemini 4 Carbon dated base rates.',
    },
    MODEL_PLACEHOLDER_M681: {
        placeholderId: 'MODEL_PLACEHOLDER_M681',
        catalogId: 'gemini-pro-orchestrator-argon',
        baseKey: 'gemini-4-argon',
        baseLabel: 'Gemini 4 Argon',
        note: 'Maps Orchestrator (Argon) to Gemini 4 Argon dated base rates.',
    },
    MODEL_PLACEHOLDER_M669: {
        placeholderId: 'MODEL_PLACEHOLDER_M669',
        catalogId: 'gemini-flash-worker-agy',
        baseKey: 'gemini-4-hydrogen',
        baseLabel: 'Gemini 4 Hydrogen',
        note: 'Shares base model MODEL_PLACEHOLDER_M432 with Gemini 4 Hydrogen.',
    },
};
let activeOrchestratorPricingMode = 'mapped';
function normalizeOrchestratorPricingMode(value) {
    return value === 'strict' ? 'strict' : 'mapped';
}
function getOrchestratorPricingMode() {
    return activeOrchestratorPricingMode;
}
function setOrchestratorPricingMode(mode) {
    activeOrchestratorPricingMode = normalizeOrchestratorPricingMode(mode);
}
/** Return the verified base-model mapping for one of the 4 Orchestrator placeholder IDs, or null. */
function getOrchestratorBaseMapping(model) {
    if (!model || !model.trim()) {
        return null;
    }
    const modelId = (0, models_1.resolveModelId)(model);
    if (typeof modelId !== 'string') {
        return null;
    }
    return Object.prototype.hasOwnProperty.call(exports.ORCHESTRATOR_BASE_PRICE_MAP, modelId)
        ? exports.ORCHESTRATOR_BASE_PRICE_MAP[modelId]
        : null;
}
function isScheduledPricingRate(pricing, base) {
    if (!pricing) {
        return false;
    }
    return pricing === CARBON_INTRO_PRICING || pricing === CARBON_STANDARD_PRICING || pricing === base['gemini-4-carbon']
        || pricing === ARGON_INTRO_PRICING || pricing === ARGON_STANDARD_PRICING || pricing === base['gemini-4-argon']
        || pricing === FLASH36_INTRO_PRICING || pricing === FLASH36_STANDARD_PRICING || pricing === base['gemini-3.6-flash']
        || pricing === FLASH_INTRO_PRICING || pricing === FLASH_STANDARD_PRICING
        || pricing === base['gemini-3.7-flash'] || pricing === base['gemini-3.8-flash'];
}
// ─── Pricing Lookup ──────────────────────────────────────────────────────────
/** Find pricing for a model by exact identity or a complete family-name prefix.
 *  Partial/substring matching is unsafe: 'claude-opus-5-6' must never inherit a
 *  5.5 price, and a custom Low-tier rate must never price the High tier. */
function findPricing(responseModel, table = exports.DEFAULT_PRICING, orchestratorPricingMode = getOrchestratorPricingMode()) {
    if (!responseModel.trim()) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(table, responseModel) && table[responseModel]) {
        return table[responseModel];
    }
    const modelId = (0, models_1.resolveModelId)(responseModel);
    // Gemini 4 has verified concrete efforts and a shared bare response family.
    // Do not erase malformed parentheses or unknown effort suffixes into that
    // family's price. Exact-key prices above remain intentional user overrides;
    // older families retain their existing preview/latest/dated alias support.
    const clean = responseModel.trim();
    if (/^(?:orchestrator|编排模型|编排器|协调器|gemini[-_ ]pro[-_ ]orchestrator)/i.test(clean) && !modelId) {
        return null;
    }
    if (/^gemini[\s_-]+4[\s_-]+(?:neon|hydrogen|carbon|argon)/i.test(clean)
        && !/^gemini[\s_-]+4[\s_-]+(?:neon|hydrogen|carbon|argon)$/i.test(clean)
        && !/^gemini[\s_-]+4[\s_-]+hydrogen[\s_-]+tiered[\s_-]+(?:high|xhigh)$/i.test(clean)
        && !modelId) {
        return null;
    }
    const imageModel = (0, models_1.isImageGenerationModel)(responseModel);
    const candidates = [];
    // A catalog alias can differ completely from its current display identity
    // (e.g. gemini-3-flash-agent). Resolve it before trying its literal spelling.
    if (typeof modelId === 'string') {
        const displayName = (0, models_1.getModelDisplayName)(modelId);
        if (typeof displayName === 'string' && displayName && displayName !== modelId) {
            candidates.push(...kebabCandidates(displayName));
        }
    }
    candidates.push(...kebabCandidates(responseModel));
    for (const candidate of new Set(candidates)) {
        if (Object.prototype.hasOwnProperty.call(table, candidate) && table[candidate]
            && (!imageModel || (0, models_1.isImageGenerationModel)(candidate))) {
            return table[candidate];
        }
        for (const [key, pricing] of Object.entries(table)) {
            if (imageModel && !(0, models_1.isImageGenerationModel)(key)) {
                continue;
            }
            // Normalize decimals on both sides, but keep the table row's tier.
            // Removing a custom row's tier would turn its rate into a family rate.
            const normalizedKey = kebabCandidates(key)[0];
            const suffix = normalizedKey && candidate.startsWith(`${normalizedKey}-`)
                ? candidate.slice(normalizedKey.length + 1) : '';
            // Only model variants may extend a price key. A numeric continuation
            // is another version: Sonnet 5.5 cannot use a Sonnet 5 row.
            const isVariant = /^(?:(?:low|medium|high|thinking|tiered|preview|latest)(?:-|$)|\d{8}(?:-|$))/.test(suffix)
                || /^(?:xhigh|extra(?:-high)?)$/.test(suffix);
            if (normalizedKey && (candidate === normalizedKey || isVariant)) {
                return pricing;
            }
        }
    }
    // Account labels are authoritative for display, but they are not pricing
    // identities. Recover the catalog key when a renamed known placeholder did
    // not match; retain exact/custom display-name prices above. The identity
    // check also prevents stale catalog metadata from pricing a renumbered ID.
    if (typeof modelId === 'string') {
        const catalogId = (0, models_1.getModelSpecs)().find(spec => spec.placeholderId === modelId)?.modelId;
        if (catalogId && catalogId !== responseModel && (0, models_1.resolveModelId)(catalogId) === modelId) {
            const directCatalog = findPricing(catalogId, table, 'strict');
            if (directCatalog) {
                return directCatalog;
            }
        }
    }
    // Mapped-base mode: map the 4 verified Orchestrator placeholders (M537/M667/M681/M669)
    // to their verified base Gemini 4 family rate in `table`.
    if (orchestratorPricingMode === 'mapped') {
        const mapping = getOrchestratorBaseMapping(responseModel);
        if (mapping && Object.prototype.hasOwnProperty.call(table, mapping.baseKey) && table[mapping.baseKey]) {
            return table[mapping.baseKey];
        }
    }
    return null;
}
/**
 * Spellings of a display name to try against the pricing table, best first.
 *
 * Two things make a single spelling insufficient:
 *  - The built-in keys disagree about decimals. Claude rows dash them
 *    ('claude-opus-4-6'), Gemini rows keep the dot ('gemini-3.1-pro'), so a fixed
 *    "4.6 → 4-6" rewrite finds the Claude rows and misses every Gemini row.
 *  - A tier suffix is only resolvable while it is in English. `resolveModelId`
 *    above knows "Gemini 3.1 Pro (High)" but not its localized form, and the
 *    localized suffix survives kebab-casing, so "Gemini 3.1 Pro (高)" reached the
 *    end of this function with no match and the model's cost silently read $0 for
 *    every user running a non-English UI. Dropping the trailing parenthetical
 *    recovers the base name, which is locale-independent.
 */
function kebabCandidates(displayName) {
    const kebab = (s, dashDecimals) => {
        // Family-only response identifiers can use constant-style underscores,
        // even though they intentionally cannot resolve to a concrete effort.
        const base = s.replace(/[()]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        return dashDecimals ? base.replace(/(\d+)\.(\d+)/g, '$1-$2') : base;
    };
    // Coordinator, worker, and specialized non-effort variants (e.g. M669 Orchestrator, M578 Sonar)
    // are separate identities. Stripping their parenthetical would apply a legacy custom "Orchestrator"
    // rate to Argon/Neon or silently fall through onto the base Hydrogen row.
    const trimmed = displayName.trim();
    const isCoordinatorOrSpecialized = /^(?:orchestrator|编排模型|编排器|协调器)\s*[（(]/i.test(trimmed)
        || /[（(][^()（）]*(?:orchestrator|worker|sonar|编排模型|编排器|协调器|执行模型|执行器)[^()（）]*[）)]/i.test(trimmed);
    const withoutTier = isCoordinatorOrSpecialized
        ? displayName : displayName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const out = [kebab(displayName, true), kebab(displayName, false)];
    if (withoutTier && withoutTier !== displayName) {
        out.push(kebab(withoutTier, false), kebab(withoutTier, true));
    }
    return out.filter((v, i) => v && out.indexOf(v) === i);
}
/**
 * Resolve pricing for a model, letting the user's custom prices win.
 *
 * Merging the two tables into one and calling `findPricing` does NOT work, for two
 * separate reasons that both had to be fixed here:
 *  - Insertion order. The prefix and fuzzy passes in `findPricing` walk keys in order,
 *    so the built-in 'gemini-3.7-flash' is reached before any custom row and wins for
 *    every variant id that starts with it. A custom row could never take effect.
 *  - Key namespace. The Pricing tab labels its editable rows with the ledger's model
 *    key — a display name such as "Gemini 3.7 Flash (High)" — while the ledger and GM
 *    data look pricing up by catalog id such as 'gemini-3.7-flash-high'. The two
 *    spellings never meet by string matching alone, so the query is also tried under
 *    the canonical display name of whatever model id it resolves to.
 */
function findPricingWithCustom(responseModel, custom, base = exports.DEFAULT_PRICING, orchestratorPricingMode = getOrchestratorPricingMode()) {
    if (responseModel && Object.keys(custom).length > 0) {
        for (const alias of pricingLookupAliases(responseModel)) {
            if (Object.prototype.hasOwnProperty.call(custom, alias) && custom[alias]) {
                return custom[alias];
            }
        }
        // Persisted custom prices can use a localized tier label or a diagnostic
        // suffix from a previous session. Compare concrete identities as well.
        const modelId = (0, models_1.resolveModelId)(responseModel);
        if (typeof modelId === 'string') {
            for (const [key, pricing] of Object.entries(custom)) {
                if ((0, models_1.resolveModelId)(key) === modelId) {
                    return pricing;
                }
            }
        }
        // Never map base-family custom overrides onto legacy Orchestrator identities;
        // explicit overrides on the Orchestrator identity itself still match above.
        const viaCustom = findPricing(responseModel, custom, 'strict');
        if (viaCustom) {
            return viaCustom;
        }
    }
    return findPricing(responseModel, base, orchestratorPricingMode);
}
/** Resolve the standard rate at usage time, while every explicit custom rate wins. */
function findPricingForDate(model, custom = {}, at = new Date(), base = exports.DEFAULT_PRICING, orchestratorPricingMode = getOrchestratorPricingMode()) {
    const override = findPricingWithCustom(model, custom, {}, 'strict');
    if (override) {
        return override;
    }
    const pricing = findPricing(model, base, orchestratorPricingMode);
    if (!pricing) {
        return null;
    }
    // Check both immutable rate eras before reading dynamic default getters;
    // crossing midnight between two reads must not lose the family identity.
    const isCarbon = pricing === CARBON_INTRO_PRICING || pricing === CARBON_STANDARD_PRICING
        || pricing === base['gemini-4-carbon'];
    const isArgon = pricing === ARGON_INTRO_PRICING || pricing === ARGON_STANDARD_PRICING
        || pricing === base['gemini-4-argon'];
    const isFlash36 = pricing === FLASH36_INTRO_PRICING || pricing === FLASH36_STANDARD_PRICING
        || pricing === base['gemini-3.6-flash'];
    const isFlash = pricing === FLASH_INTRO_PRICING || pricing === FLASH_STANDARD_PRICING
        || pricing === base['gemini-3.7-flash'] || pricing === base['gemini-3.8-flash'];
    if (!isCarbon && !isArgon && !isFlash36 && !isFlash) {
        return pricing;
    }
    const time = pricingTimestamp(at);
    // An invalid historic timestamp is not evidence that today's rate applied.
    if (time === null) {
        return null;
    }
    if (isCarbon) {
        return time < CARBON_RATE_CHANGE ? CARBON_INTRO_PRICING : CARBON_STANDARD_PRICING;
    }
    if (isArgon) {
        return time < ARGON_RATE_CHANGE ? ARGON_INTRO_PRICING : ARGON_STANDARD_PRICING;
    }
    if (isFlash36) {
        return time >= FLASH36_PROMO_START && time < FLASH_RATE_CHANGE
            ? FLASH36_INTRO_PRICING : FLASH36_STANDARD_PRICING;
    }
    return time < FLASH_RATE_CHANGE ? FLASH_INTRO_PRICING : FLASH_STANDARD_PRICING;
}
/**
 * Resolve pricing along with transparent rate provenance:
 * - `'custom'`: explicit user custom override (always wins in both mapped and strict modes)
 * - `'official'`: built-in verified standard API rate
 * - `'mapped_base'`: mapped via verified base Gemini 4 family rate (in `'mapped'` mode)
 * - `'unpriced'`: no rate available (or strict mode without custom override, or missing date on scheduled cutover)
 */
function resolvePricingDetail(model, custom = {}, options = {}) {
    const base = options.base ?? exports.DEFAULT_PRICING;
    const mode = options.orchestratorPricingMode ?? getOrchestratorPricingMode();
    if (!model || !model.trim()) {
        return { pricing: null, provenance: 'unpriced' };
    }
    const mapping = getOrchestratorBaseMapping(model);
    // 1. User custom override always wins.
    const customMatch = findPricingWithCustom(model, custom, {}, 'strict');
    if (customMatch) {
        return {
            pricing: customMatch,
            provenance: 'custom',
            ...(mapping ? { mappedBaseKey: mapping.baseKey, mappedBaseLabel: mapping.baseLabel } : {}),
            isScheduled: false,
        };
    }
    // 2. Direct official built-in rate (strict lookup).
    const officialMatch = options.at !== undefined
        ? findPricingForDate(model, {}, options.at, base, 'strict')
        : findPricing(model, base, 'strict');
    if (officialMatch) {
        return {
            pricing: officialMatch,
            provenance: 'official',
            isScheduled: isScheduledPricingRate(officialMatch, base),
        };
    }
    // 3. Base-model mapped rate for the 4 verified Orchestrator placeholders (mapped mode only).
    if (mode === 'mapped' && mapping) {
        const mappedMatch = options.at !== undefined
            ? findPricingForDate(model, {}, options.at, base, 'mapped')
            : findPricing(model, base, 'mapped');
        if (mappedMatch) {
            return {
                pricing: mappedMatch,
                provenance: 'mapped_base',
                mappedBaseKey: mapping.baseKey,
                mappedBaseLabel: mapping.baseLabel,
                isScheduled: isScheduledPricingRate(mappedMatch, base),
            };
        }
    }
    return {
        pricing: null,
        provenance: 'unpriced',
        ...(mapping ? { mappedBaseKey: mapping.baseKey, mappedBaseLabel: mapping.baseLabel } : {}),
    };
}
const MS_PER_DAY = 86_400_000;
const SCHEDULED_RATE_CHANGES = [
    {
        modelKey: 'gemini-4-carbon',
        familyLabel: 'Gemini 4 Carbon',
        effectiveDate: '2026-12-01',
        effectiveTimestampMs: CARBON_RATE_CHANGE,
        currentPricing: CARBON_INTRO_PRICING,
        nextPricing: CARBON_STANDARD_PRICING,
    },
    {
        modelKey: 'gemini-4-argon',
        familyLabel: 'Gemini 4 Argon',
        effectiveDate: '2026-12-01',
        effectiveTimestampMs: ARGON_RATE_CHANGE,
        currentPricing: ARGON_INTRO_PRICING,
        nextPricing: ARGON_STANDARD_PRICING,
    },
    {
        modelKey: 'gemini-3.8-flash',
        familyLabel: 'Gemini 3.8 Flash',
        effectiveDate: '2027-01-01',
        effectiveTimestampMs: FLASH_RATE_CHANGE,
        currentPricing: FLASH_INTRO_PRICING,
        nextPricing: FLASH_STANDARD_PRICING,
    },
    {
        modelKey: 'gemini-3.7-flash',
        familyLabel: 'Gemini 3.7 Flash',
        effectiveDate: '2027-01-01',
        effectiveTimestampMs: FLASH_RATE_CHANGE,
        currentPricing: FLASH_INTRO_PRICING,
        nextPricing: FLASH_STANDARD_PRICING,
    },
    {
        modelKey: 'gemini-3.6-flash',
        familyLabel: 'Gemini 3.6 Flash',
        effectiveDate: '2027-01-01',
        effectiveTimestampMs: FLASH_RATE_CHANGE,
        promoStartMs: FLASH36_PROMO_START,
        currentPricing: FLASH36_INTRO_PRICING,
        nextPricing: FLASH36_STANDARD_PRICING,
    },
];
/**
 * Return verified upcoming list-price cutovers occurring within `withinDays` of `nowMs`.
 * Single source of truth shared by the status bar hover tooltip and Pricing tab.
 */
function getUpcomingRateChanges(nowMs = Date.now(), withinDays = 30) {
    if (!Number.isFinite(nowMs) || !Number.isFinite(withinDays) || withinDays < 0) {
        return [];
    }
    const maxDeltaMs = withinDays * MS_PER_DAY;
    const out = [];
    for (const item of SCHEDULED_RATE_CHANGES) {
        if (item.promoStartMs !== undefined && nowMs < item.promoStartMs) {
            continue;
        }
        const remainingMs = item.effectiveTimestampMs - nowMs;
        if (remainingMs <= 0 || remainingMs > maxDeltaMs) {
            continue;
        }
        const multiplier = item.currentPricing.input > 0
            ? Number((item.nextPricing.input / item.currentPricing.input).toFixed(2))
            : 1;
        out.push({
            modelKey: item.modelKey,
            familyLabel: item.familyLabel,
            effectiveDate: item.effectiveDate,
            effectiveTimestampMs: item.effectiveTimestampMs,
            daysRemaining: Math.max(1, Math.ceil(remainingMs / MS_PER_DAY)),
            currentPricing: item.currentPricing,
            nextPricing: item.nextPricing,
            multiplier,
        });
    }
    out.sort((a, b) => a.effectiveTimestampMs - b.effectiveTimestampMs || a.modelKey.localeCompare(b.modelKey));
    return out;
}
/**
 * Return the upcoming verified rate change for a specific model identifier,
 * or `null` if none applies (or if a user custom rate overrides the built-in schedule).
 */
function getUpcomingRateChangeForModel(model, custom = {}, nowMs = Date.now(), withinDays = 30, orchestratorPricingMode = getOrchestratorPricingMode()) {
    if (!model || !model.trim()) {
        return null;
    }
    if (findPricingWithCustom(model, custom, {}, 'strict')) {
        return null;
    }
    const upcoming = getUpcomingRateChanges(nowMs, withinDays);
    if (upcoming.length === 0) {
        return null;
    }
    // Match against a single-entry probe table so exact variant & alias rules apply identically.
    for (const change of upcoming) {
        if (findPricing(model, { [change.modelKey]: change.currentPricing }, orchestratorPricingMode)) {
            return change;
        }
    }
    return null;
}
/** The spellings a single model answers to: as given, its model id, its display name. */
function pricingLookupAliases(responseModel) {
    const out = [responseModel];
    const modelId = (0, models_1.resolveModelId)(responseModel);
    if (typeof modelId === 'string') {
        out.push(modelId);
        const displayName = (0, models_1.getModelDisplayName)(modelId);
        if (typeof displayName === 'string' && displayName) {
            out.push(displayName);
        }
    }
    return out.filter((v, i) => v && out.indexOf(v) === i);
}
/**
 * The one cost formula. Thinking tokens are billed at the thinking rate and are a
 * subset of the reported output count, so they are subtracted before applying the
 * output rate. Cache *creation* is deliberately not billed here — the platform's
 * reported cacheCreationTokens are not consistently populated, and every existing
 * cost path in this extension has always excluded them; including them in one path
 * only would make two screens disagree about the same day.
 */
function costFromTokens(t, pricing) {
    const responseOutput = Math.max(0, (t.outputTokens || 0) - (t.thinkingTokens || 0));
    return ((t.inputTokens || 0) * pricing.input +
        responseOutput * pricing.output +
        (t.cacheReadTokens || 0) * pricing.cacheRead +
        (t.thinkingTokens || 0) * pricing.thinking) / 1_000_000;
}
/** Match concrete tiers without letting a shared response family merge them. */
function samePricingModel(left, right) {
    if (left === right) {
        return true;
    }
    const leftId = (0, models_1.resolveModelId)(left);
    const rightId = (0, models_1.resolveModelId)(right);
    if (typeof leftId === 'string' && typeof rightId === 'string') {
        return leftId === rightId;
    }
    const leftName = (0, models_1.getModelBaseName)(left);
    const rightName = (0, models_1.getModelBaseName)(right);
    return typeof leftName === 'string' && typeof rightName === 'string'
        && leftName.toLowerCase() === rightName.toLowerCase();
}
/** A response label can recover a missing identity, but cannot replace a known model. */
function selectPricingModel(model, responseModel, custom = {}) {
    return (0, models_1.resolveModelId)(model) || findPricingWithCustom(model, custom) ? model : responseModel || model;
}
function tokenCostBreakdown(tokens, pricing) {
    const responseOutput = Math.max(0, tokens.outputTokens - tokens.thinkingTokens);
    const inputCost = pricing ? tokens.inputTokens * pricing.input / 1_000_000 : 0;
    const outputCost = pricing ? responseOutput * pricing.output / 1_000_000 : 0;
    const cacheCost = pricing ? tokens.cacheReadTokens * pricing.cacheRead / 1_000_000 : 0;
    const thinkingCost = pricing ? tokens.thinkingTokens * pricing.thinking / 1_000_000 : 0;
    return { inputCost, outputCost, cacheCost, thinkingCost,
        totalCost: inputCost + outputCost + cacheCost + thinkingCost, pricing };
}
/** Price complete per-call evidence, otherwise use the archived day or a frozen total. */
function calculateUsageCosts(model, tokens, custom, options = {}) {
    const mode = options.orchestratorPricingMode ?? getOrchestratorPricingMode();
    const calls = options.calls || [];
    const fields = ['inputTokens', 'outputTokens', 'thinkingTokens', 'cacheReadTokens'];
    // A retrieval/snapshot time is never a usage date. Only a caller supplying
    // an actual archived calendar day may price the otherwise undated remainder.
    const pricing = findPricingForDate(model, custom, options.at ?? '', exports.DEFAULT_PRICING, mode);
    const detail = resolvePricingDetail(model, custom, { orchestratorPricingMode: mode });
    const usableCalls = (options.callCount === undefined || calls.length <= options.callCount)
        && fields.every(field => calls.every(call => Number.isFinite(call[field]) && call[field] >= 0)
            && calls.reduce((sum, call) => sum + call[field], 0) <= tokens[field]);
    const remainder = { ...tokens };
    const parts = [];
    if (usableCalls) {
        for (const call of calls) {
            const callPricing = findPricingForDate(call.model || model, custom, call.createdAt, exports.DEFAULT_PRICING, mode);
            if (!callPricing) {
                continue;
            }
            parts.push(tokenCostBreakdown(call, callPricing));
            for (const field of fields) {
                remainder[field] -= call[field];
            }
        }
    }
    const hasRemainder = fields.some(field => remainder[field] > 0);
    const override = findPricingWithCustom(model, custom, {}, 'strict');
    const builtIn = findPricing(model, exports.DEFAULT_PRICING, mode);
    const scheduled = isScheduledPricingRate(builtIn, exports.DEFAULT_PRICING);
    if (hasRemainder && !override && (scheduled || !pricing)
        && Number.isFinite(options.frozenCost) && (options.frozenCost || 0) > 0) {
        // A pool/day aggregate may cross a UTC price boundary. Preserve its
        // already-recorded total instead of inventing a split between rate eras.
        const effPricing = pricing || builtIn;
        const prov = effPricing ? detail.provenance : 'unpriced';
        return {
            inputCost: 0, outputCost: 0, cacheCost: 0, thinkingCost: 0,
            totalCost: options.frozenCost, pricing: effPricing, provenance: prov,
            ...(detail.mappedBaseLabel ? { mappedBaseLabel: detail.mappedBaseLabel } : {}),
            costBreakdownUnavailable: true,
        };
    }
    if (hasRemainder && pricing) {
        parts.push(tokenCostBreakdown(remainder, pricing));
    }
    const incomplete = hasRemainder && !pricing;
    const displayedPricing = incomplete ? null : pricing || parts[0]?.pricing || findPricingWithCustom(model, custom, exports.DEFAULT_PRICING, mode);
    const displayedProvenance = displayedPricing ? detail.provenance : 'unpriced';
    const usesHistoricalRates = parts.some(part => part.pricing !== displayedPricing);
    return parts.reduce((total, part) => ({
        inputCost: total.inputCost + part.inputCost, outputCost: total.outputCost + part.outputCost,
        cacheCost: total.cacheCost + part.cacheCost, thinkingCost: total.thinkingCost + part.thinkingCost,
        totalCost: total.totalCost + part.totalCost, pricing: displayedPricing,
        provenance: displayedProvenance,
        ...(detail.mappedBaseLabel ? { mappedBaseLabel: detail.mappedBaseLabel } : {}),
        usesHistoricalRates,
    }), {
        inputCost: 0, outputCost: 0, cacheCost: 0, thinkingCost: 0, totalCost: 0,
        pricing: displayedPricing, provenance: displayedProvenance,
        ...(detail.mappedBaseLabel ? { mappedBaseLabel: detail.mappedBaseLabel } : {}),
        usesHistoricalRates,
    });
}
/** Shared ledger/archival/UI pricing path, with per-call timestamps when retained. */
function calculateLedgerModelCosts(modelKey, stats, bucket, custom, date, orchestratorPricingMode) {
    const calls = (bucket.recordedCalls || []).filter(call => samePricingModel(call.modelKey, modelKey));
    return calculateUsageCosts(modelKey, stats, custom, {
        at: date,
        callCount: stats.calls,
        frozenCost: stats.estimatedCost,
        orchestratorPricingMode,
        // createdAtMs can be the ledger's ingestion-time fallback, so it is not
        // evidence of when a historical provider call was actually made.
        calls: calls.map(call => ({ ...call, model: call.modelId || modelKey, createdAt: call.createdAt || '' })),
    });
}
// ─── Cost Calculation ────────────────────────────────────────────────────────
function calculateCosts(summary, customPricing, orchestratorPricingMode = getOrchestratorPricingMode()) {
    const entries = Object.entries(summary.modelBreakdown);
    // Merge rows by base model name (e.g. M37 + M16 both → "Gemini 3.1 Pro (High)")
    const mergedRows = new Map();
    let grandTotal = 0;
    for (const [name, ms] of entries) {
        const displayName = (0, models_1.normalizeModelDisplayName)(name);
        const baseName = (0, models_1.getModelBaseName)(name) || displayName;
        const model = selectPricingModel(name, ms.responseModel, customPricing);
        const calls = (summary.conversations || []).flatMap(conversation => conversation.calls)
            .filter(call => samePricingModel(call.modelDisplay || call.model || call.responseModel, model));
        const costs = calculateUsageCosts(model, {
            inputTokens: ms.totalInputTokens, outputTokens: ms.totalOutputTokens,
            thinkingTokens: ms.totalThinkingTokens, cacheReadTokens: ms.totalCacheRead,
        }, customPricing, { calls, callCount: ms.callCount, orchestratorPricingMode });
        const { pricing, provenance, mappedBaseLabel, inputCost, outputCost, cacheCost, thinkingCost, totalCost } = costs;
        const responseOutputTokens = Math.max(0, ms.totalOutputTokens - ms.totalThinkingTokens);
        grandTotal += totalCost;
        const existing = mergedRows.get(baseName);
        if (existing) {
            existing.inputCost += inputCost;
            existing.outputCost += outputCost;
            existing.cacheCost += cacheCost;
            existing.thinkingCost += thinkingCost;
            existing.totalCost += totalCost;
            existing.inputTokens += ms.totalInputTokens;
            existing.outputTokens += responseOutputTokens;
            existing.cacheTokens += ms.totalCacheRead;
            existing.thinkingTokens += ms.totalThinkingTokens;
            existing.usesHistoricalRates ||= costs.usesHistoricalRates;
            if (!pricing) {
                existing.pricing = null;
                existing.provenance = 'unpriced';
            }
        }
        else {
            mergedRows.set(baseName, {
                name: displayName, responseModel: ms.responseModel,
                inputCost, outputCost, cacheCost, thinkingCost, totalCost,
                inputTokens: ms.totalInputTokens, outputTokens: responseOutputTokens,
                cacheTokens: ms.totalCacheRead,
                thinkingTokens: ms.totalThinkingTokens, pricing: pricing || null,
                provenance: pricing ? (provenance ?? 'official') : 'unpriced',
                ...(mappedBaseLabel ? { mappedBaseLabel } : {}),
                usesHistoricalRates: costs.usesHistoricalRates,
            });
        }
    }
    const rows = [...mergedRows.values()].sort((a, b) => b.totalCost - a.totalCost);
    return { rows, grandTotal };
}
// ─── Pricing Store (globalState persistence) ─────────────────────────────────
const STORAGE_KEY = 'customModelPricing';
const ORCHESTRATOR_MODE_STORAGE_KEY = 'orchestratorPricingMode';
class PricingStore {
    _custom = {};
    _orchestratorPricingMode = 'mapped';
    _modeExplicit = false;
    _globalState = null;
    /** Initialize from globalState */
    init(globalState) {
        this._globalState = globalState;
        this._custom = globalState.get(STORAGE_KEY, {});
        this._orchestratorPricingMode = normalizeOrchestratorPricingMode(globalState.get(ORCHESTRATOR_MODE_STORAGE_KEY, 'mapped'));
        this._modeExplicit = true;
        setOrchestratorPricingMode(this._orchestratorPricingMode);
    }
    /** Get current Orchestrator pricing mode ('mapped' default vs 'strict'). */
    getOrchestratorPricingMode() {
        return this._modeExplicit ? this._orchestratorPricingMode : getOrchestratorPricingMode();
    }
    /** Update Orchestrator pricing mode synchronously (in-memory + active module default). */
    setOrchestratorPricingModeSync(mode) {
        this._orchestratorPricingMode = normalizeOrchestratorPricingMode(mode);
        this._modeExplicit = true;
        setOrchestratorPricingMode(this._orchestratorPricingMode);
    }
    /** Update Orchestrator pricing mode and persist to globalState. */
    async setOrchestratorPricingMode(mode) {
        this._orchestratorPricingMode = normalizeOrchestratorPricingMode(mode);
        this._modeExplicit = true;
        setOrchestratorPricingMode(this._orchestratorPricingMode);
        if (this._globalState) {
            await this._globalState.update(ORCHESTRATOR_MODE_STORAGE_KEY, this._orchestratorPricingMode);
        }
    }
    /** Get merged pricing table (custom overrides default) */
    getMerged() {
        return { ...exports.DEFAULT_PRICING, ...this._custom };
    }
    /** Get user custom overrides only */
    getCustom() {
        return { ...this._custom };
    }
    /** Update custom pricing for a model and persist */
    async set(responseModel, pricing) {
        this._custom[responseModel] = pricing;
        await this._persist();
    }
    /** Bulk set custom pricing and persist */
    async setAll(custom) {
        this._custom = { ...custom };
        await this._persist();
    }
    /** Reset all custom pricing to defaults */
    async reset() {
        this._custom = {};
        await this._persist();
    }
    /** Calculate costs using current merged pricing & Orchestrator pricing mode */
    calculateCosts(summary) {
        return calculateCosts(summary, this._custom, this.getOrchestratorPricingMode());
    }
    async _persist() {
        if (this._globalState) {
            await this._globalState.update(STORAGE_KEY, this._custom);
        }
    }
}
exports.PricingStore = PricingStore;
function trimTrailingZeros(fixed, minDecimals = 0) {
    if (!fixed.includes('.')) {
        return fixed;
    }
    const [whole, frac] = fixed.split('.');
    let end = frac.length;
    while (end > minDecimals && frac[end - 1] === '0') {
        end--;
    }
    return end === 0 ? whole : `${whole}.${frac.slice(0, end)}`;
}
function formatUsdMagnitude(absAmount, precision) {
    if (absAmount === 0) {
        return precision === 'rate' ? '0' : '0.00';
    }
    if (precision === 'rate') {
        if (absAmount < 0.01 && Number(absAmount.toFixed(4)) < 0.01) {
            return trimTrailingZeros(absAmount.toFixed(4));
        }
        if (absAmount < 1 && Number(absAmount.toFixed(3)) < 1) {
            return trimTrailingZeros(absAmount.toFixed(3), 2);
        }
        return trimTrailingZeros(absAmount.toFixed(2));
    }
    if (precision === 'call') {
        if (absAmount < 0.001 && Number(absAmount.toFixed(4)) < 0.001) {
            return absAmount.toFixed(4);
        }
        if (absAmount < 1 && Number(absAmount.toFixed(3)) < 1) {
            return absAmount.toFixed(3);
        }
        return absAmount.toFixed(2);
    }
    // 'standard'
    if (absAmount < 0.01 && Number(absAmount.toFixed(4)) < 0.01) {
        return absAmount.toFixed(4);
    }
    return absAmount.toFixed(2);
}
/**
 * Format a USD cost amount safely.
 * Returns `'—'` for non-finite inputs (`NaN`, `Infinity`, `-Infinity`).
 */
function formatUsdCost(usdAmount, options = {}) {
    if (!Number.isFinite(usdAmount)) {
        return '—';
    }
    const precision = options.precision ?? 'standard';
    const allowNegative = options.allowNegative ?? false;
    const normalized = !allowNegative && usdAmount < 0 ? 0 : (Object.is(usdAmount, -0) ? 0 : usdAmount);
    const formatted = formatUsdMagnitude(Math.abs(normalized), precision);
    const isRoundedZero = /^0(?:\.0+)?$/.test(formatted);
    const sign = normalized < 0 && !isRoundedZero ? '-' : '';
    return `${sign}$${formatted}`;
}
/**
 * Format positive USD cache savings with a leading minus sign (e.g. `-$0.45`).
 * Returns `'—'` when `usdSaved` is non-finite, `<= 0`, or rounds to zero at display precision.
 */
function formatUsdSavings(usdSaved, options = {}) {
    if (!Number.isFinite(usdSaved) || usdSaved <= 0) {
        return '—';
    }
    const formatted = formatUsdCost(-usdSaved, { ...options, allowNegative: true });
    return formatted.startsWith('-') ? formatted : '—';
}
/**
 * Format a USD per-million-token rate (e.g. `$3/M`, `$0.15/M`, `$0.075/M`).
 * Returns `'—'` for non-finite or negative inputs.
 */
function formatUsdPerMillion(usdPerMillion) {
    if (!Number.isFinite(usdPerMillion) || usdPerMillion < 0) {
        return '—';
    }
    return `${formatUsdCost(usdPerMillion, { precision: 'rate' })}/M`;
}
//# sourceMappingURL=pricing-store.js.map