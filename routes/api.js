const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const { handleChatCompletion, handleImageGeneration } = require('../services/grokService');

// 获取模型列表
router.get('/models', (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: 'grok-3',
                object: 'model',
                created: 1698969600,
                owned_by: 'xai'
            },
            {
                id: 'grok-3-search',
                object: 'model',
                created: 1698969600,
                owned_by: 'xai'
            },
            {
                id: 'grok-3-think',
                object: 'model',
                created: 1698969600,
                owned_by: 'xai'
            }
        ]
    });
});

// Chat completions 路由
router.post('/chat/completions', authMiddleware, async (req, res) => {
    await handleChatCompletion(req, res);
});

// 图片生成路由
router.post('/images/generations', authMiddleware, async (req, res) => {
    await handleImageGeneration(req, res);
});

module.exports = router;