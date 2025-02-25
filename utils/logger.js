const getClientIP = (req) => {
    return req.ip ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           req.connection.remoteAddress ||
           'unknown';
};

const formatLogMessage = (method, ip, path, cookieIndex) => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${method}] IP: ${ip} Path: ${path} Cookie: #${cookieIndex + 1}`;
};

module.exports = {
    getClientIP,
    formatLogMessage
};