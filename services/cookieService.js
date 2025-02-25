const axios = require('axios');
const { getStandardHeaders } = require('../utils/headers');
const { acquireLock, releaseLock } = require('../utils/mutex');

let currentCookieIndex = 0;
let lastSuccessfulCookieIndex = 0;
let currentThinkCookieIndex = 0;
let lastSuccessfulThinkCookieIndex = 0;

// 获取API基础URL，根据是否设置反向代理
const getBaseUrl = () => {
    return process.env.REVERSE_PROXY || 'https://grok.com';
};

// 查询额度函数
const checkQuota = async (cookie, isThinkModel = false) => {
    try {
        const headers = getStandardHeaders(`sso=${cookie}`);
        const baseUrl = getBaseUrl();
        const response = await axios.post(
            `${baseUrl}/rest/rate-limits`,
            {
                requestKind: isThinkModel ? "REASONING" : "DEFAULT",
                modelName: "grok-3"
            },
            { headers }
        );
        return response.data;
    } catch (error) {
        console.error(`Failed to check quota for cookie: ${error.message}`);
        return null;
    }
};

// 获取下一个 Cookie
const getNextCookie = async (useLastSuccessful = true, isThinkModel = false) => {
    const cookies = process.env.COOKIES
        ?.split(';')
        .map(c => c.trim())
        .filter(Boolean) || [];
    if (cookies.length === 0) {
        return '';
    }
    try {
        await acquireLock('cookie-selection');
        let selectedIndex;
        if (cookies.length === 1) {
            selectedIndex = 0;
        } else {
            if (useLastSuccessful) {
                selectedIndex = isThinkModel ?
                    lastSuccessfulThinkCookieIndex :
                    lastSuccessfulCookieIndex;
            } else {
                const currentIndex = isThinkModel ?
                    currentThinkCookieIndex :
                    currentCookieIndex;
                selectedIndex = currentIndex % cookies.length;
                if (isThinkModel) {
                    currentThinkCookieIndex = selectedIndex;
                } else {
                    currentCookieIndex = selectedIndex;
                }
            }
        }
        return `sso=${cookies[selectedIndex]}`;
    } finally {
        releaseLock('cookie-selection');
    }
};

// 请求后检查当前 Cookie 额度
const checkCurrentCookieQuota = async (cookie, isThinkModel = false) => {
    if (!cookie) return;
    try {
        const cookies = process.env.COOKIES
            ?.split(';')
            .map(c => c.trim())
            .filter(Boolean) || [];
        const cookieValue = cookie.replace('sso=', '');
        const quota = await checkQuota(cookieValue, isThinkModel);
        if (quota) {
            const cookieIndex = isThinkModel ?
                currentThinkCookieIndex :
                currentCookieIndex;
            const modelType = isThinkModel ? 'Think' : 'Default';
            console.log(`[${new Date().toISOString()}] ${modelType} Cookie #${cookieIndex + 1} 剩余额度: ${quota.remainingQueries}`);
            if (quota.remainingQueries <= 0) {
                if (isThinkModel) {
                    currentThinkCookieIndex++;
                } else {
                    currentCookieIndex++;
                }
                console.log(`[${new Date().toISOString()}] ${modelType} Cookie #${cookieIndex + 1} 额度已用尽，下次请求将切换到 Cookie #${(isThinkModel ? currentThinkCookieIndex : currentCookieIndex) % cookies.length + 1}`);
            }
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 检查额度时出错:`, error);
    }
};

// 初始化：仅显示加载的 cookie 数量
const initializeQuotas = async () => {
    const cookies = process.env.COOKIES
        ?.split(';')
        .map(c => c.trim())
        .filter(Boolean) || [];
    console.log(`[${new Date().toISOString()}] 服务启动`);
    console.log(`[${new Date().toISOString()}] 已加载 ${cookies.length} 个 Cookie`);
    if (process.env.REVERSE_PROXY) {
        console.log(`[${new Date().toISOString()}] 使用反向代理: ${process.env.REVERSE_PROXY}`);
    } else {
        console.log(`[${new Date().toISOString()}] 使用默认请求地址: https://grok.com`);
    }
};

// 获取当前 cookie 索引
const getCurrentCookieIndex = () => {
    return currentCookieIndex;
};

// 获取当前 think cookie 索引
const getCurrentThinkCookieIndex = () => {
    return currentThinkCookieIndex;
};

module.exports = {
    getNextCookie,
    checkCurrentCookieQuota,
    initializeQuotas,
    getBaseUrl,
    getCookiesState: () => ({
        currentCookieIndex,
        lastSuccessfulCookieIndex,
        currentThinkCookieIndex,
        lastSuccessfulThinkCookieIndex
    }),
    setLastSuccessfulCookieIndex: (index) => { lastSuccessfulCookieIndex = index; },
    incrementCurrentCookieIndex: () => { currentCookieIndex++; },
    setCurrentCookieIndex: (index) => { currentCookieIndex = index; },
    getCurrentCookieIndex,
    setLastSuccessfulThinkCookieIndex: (index) => { lastSuccessfulThinkCookieIndex = index; },
    incrementThinkCookieIndex: () => { currentThinkCookieIndex++; },
    setCurrentThinkCookieIndex: (index) => { currentThinkCookieIndex = index; },
    getCurrentThinkCookieIndex
};