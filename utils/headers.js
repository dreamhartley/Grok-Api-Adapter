const getStandardHeaders = (cookie) => {
    return {
        accept: '*/*',
        'accept-encoding': 'gzip, deflate',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        cookie: cookie,
        dnt: '1',
        origin: 'https://grok.com',
        referer: 'https://grok.com/',
        'sec-ch-ua': '"Not(A:Brand";v="99", "Chromium";v="122", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
};

module.exports = { getStandardHeaders };