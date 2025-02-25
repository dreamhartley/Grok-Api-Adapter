module.exports = (req, res, next) => {
    if (process.env.API_KEYS) {
        const apiKeys = process.env.API_KEYS.split(';');
        const authHeader = req.headers.authorization;
        if (!authHeader || !apiKeys.includes(authHeader.replace('Bearer ', ''))) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    next();
};