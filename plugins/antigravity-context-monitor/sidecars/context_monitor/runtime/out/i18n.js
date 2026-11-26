"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initI18n = initI18n;
exports.setLanguage = setLanguage;
exports.showLanguagePicker = showLanguagePicker;
const i18n_core_1 = require("./i18n-core");
__exportStar(require("./i18n-core"), exports);
/**
 * Initialize i18n from VS Code configuration.
 * Call once during extension activation.
 */
function initI18n(context) {
    const saved = context.globalState.get('displayLanguage', 'both');
    if (saved && (0, i18n_core_1.isLanguage)(saved)) {
        (0, i18n_core_1.setLanguageInMemory)(saved);
    }
}
/**
 * Set and persist the display language.
 */
async function setLanguage(lang, context, state) {
    (0, i18n_core_1.setLanguageInMemory)(lang);
    await context.globalState.update('displayLanguage', lang);
    if (state) {
        await state.update('displayLanguage', lang);
    }
}
/**
 * Show a QuickPick for the user to select display language.
 */
async function showLanguagePicker(context, state) {
    const vscodeApi = require('vscode');
    const currentLanguage = (0, i18n_core_1.getLanguage)();
    const items = [
        {
            label: '$(globe) 中文',
            description: 'Chinese Only — 仅显示中文',
            detail: currentLanguage === 'zh' ? '✅ Current / 当前' : '',
        },
        {
            label: '$(globe) English',
            description: 'English Only — 仅显示英文',
            detail: currentLanguage === 'en' ? '✅ Current / 当前' : '',
        },
        {
            label: '$(globe) Bilingual / 双语',
            description: 'English + Chinese — 中英双语',
            detail: currentLanguage === 'both' ? '✅ Current / 当前' : '',
        },
    ];
    const picked = await vscodeApi.window.showQuickPick(items, {
        title: '📊 ' + (0, i18n_core_1.tBi)('Select Display Language', '选择显示语言'),
        placeHolder: (0, i18n_core_1.tBi)('Pick a language for the context monitor UI', '选择上下文监控界面语言'),
        canPickMany: false,
    });
    if (!picked) {
        return;
    }
    let lang;
    if (picked.label.includes('中文') && !picked.label.includes('Bilingual')) {
        lang = 'zh';
    }
    else if (picked.label.includes('English') && !picked.label.includes('Bilingual')) {
        lang = 'en';
    }
    else {
        lang = 'both';
    }
    if (state) {
        await (0, i18n_core_1.setLanguageToState)(lang, state);
        await context.globalState.update('displayLanguage', lang);
        return;
    }
    await setLanguage(lang, context);
}
//# sourceMappingURL=i18n.js.map