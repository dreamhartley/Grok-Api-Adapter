const axios = require('axios');
const crypto = require('crypto');
const { getStandardHeaders } = require('../utils/headers');
const { getNextCookie, getBaseUrl, setLastSuccessfulCookieIndex, setCurrentCookieIndex, incrementCurrentCookieIndex, checkCurrentCookieQuota, getCurrentCookieIndex, setLastSuccessfulThinkCookieIndex, setCurrentThinkCookieIndex, incrementThinkCookieIndex, getCurrentThinkCookieIndex } = require('./cookieService');
const { getClientIP, formatLogMessage } = require('../utils/logger');

const MIME_TYPE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
};

// 文件上传函数
const uploadFileToGrok = async (base64Content, fileName, mimeType, cookie) => {
    try {
        const headers = getStandardHeaders(cookie);
        const payload = {
            fileName,
            fileMimeType: mimeType,
            content: base64Content
        };
        const baseUrl = getBaseUrl();
        const response = await axios.post(
            `${baseUrl}/rest/app-chat/upload-file`,
            payload,
            { headers }
        );
        return response.data.fileMetadataId;
    } catch (error) {
        console.error('File upload error:', error);
        throw error;
    }
};

// 从消息中提取文件并上传
const extractFilesFromMessage = async (message, cookie) => {
    const fileIds = [];
    let content = message.content;
    // 确保 content 是数组
    if (!Array.isArray(content)) {
        content = [{ type: 'text', text: content }];
    }

    for (const item of content) {
        if (item.type === 'image_url') {
            let base64Content = '';
            let mimeType = '';
            let fileName = '';
            // 处理两种可能的图片URL格式
            const imageUrl = typeof item.image_url === 'string'
                ? item.image_url
                : item.image_url?.url;

            if (imageUrl?.startsWith('data:')) {
                const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    base64Content = matches[2];
                    const extension = MIME_TYPE_EXTENSIONS[mimeType] || 'jpg';
                    fileName = `image_${Date.now()}.${extension}`;
                    try {
                        const fileId = await uploadFileToGrok(base64Content, fileName, mimeType, cookie);
                        fileIds.push({ id: fileId, fileName });
                    } catch (error) {
                        console.error(`Failed to upload image ${fileName}:`, error);
                    }
                }
            }
        }
    }
    return fileIds;
};

// 转换 OpenAI 格式的请求为 Grok 格式
const convertToGrokFormat = async (openaiRequest) => {
    let messageText = '';
    let allFileIds = [];
    const cookie = await getNextCookie(true, false); // 获取 cookie，但不扣除额度

    // 处理所有消息中的图片
    for (const message of openaiRequest.messages) {
        if (Array.isArray(message.content)) {
            // 提取当前消息中的文本
            const textContent = message.content
                .filter(content => content.type === 'text')
                .map(content => content.text)
                .join('\n');

            // 处理图片
            const hasImages = message.content.some(content =>
                content.type === 'image_url' && (
                    (typeof content.image_url === 'string' && content.image_url.startsWith('data:')) ||
                    (content.image_url?.url?.startsWith('data:'))
                )
            );

            if (hasImages) {
                const fileResults = await extractFilesFromMessage(message, cookie);
                allFileIds.push(...fileResults.map(f => f.id));
                // 将图片文件名添加到消息内容中
                const imageNames = fileResults.map(f => f.fileName).join(', ');
                messageText += `${message.role}: ${textContent}\n[Attached images: ${imageNames}]\n`;
            } else {
                messageText += `${message.role}: ${textContent}\n`;
            }
        } else {
            // 处理纯文本消息
            messageText += `${message.role}: ${message.content}\n`;
        }
    }

    // 根据模型选择设置参数
    const isThinkModel = openaiRequest.model === 'grok-3-think';
    const isSearchModel = openaiRequest.model === 'grok-3-search';

    const disableSearch = !isSearchModel;
    const toolOverrides = isSearchModel ? {} : {
        imageGen: false,
        webSearch: false,
        xSearch: false,
        xMediaSearch: false,
        trendsSearch: false,
        xPostAnalyze: false
    };

    return {
        temporary: true,
        modelName: 'grok-3',
        message: messageText.trim(),
        fileAttachments: allFileIds,
        imageAttachments: [],
        disableSearch,
        enableImageGeneration: true,
        returnImageBytes: false,
        returnRawGrokInXaiRequest: false,
        enableImageStreaming: !!openaiRequest.stream,
        imageGenerationCount: 2,
        forceConcise: false,
        toolOverrides,
        enableSideBySide: true,
        isPreset: false,
        sendFinalMetadata: true,
        customInstructions: '',
        deepsearchPreset: '',
        isReasoning: isThinkModel,  // 根据模型设置 isReasoning
    };
};

// 根据 Grok payload 发送请求，支持流式和非流式返回
const makeGrokRequest = async (grokPayload, isStream, startIndex = 0, isThinkModel = false) => {
    const cookies = process.env.COOKIES
        ?.split(';')
        .map(c => c.trim())
        .filter(Boolean) || [];

    if (isThinkModel) {
        setCurrentThinkCookieIndex(startIndex);
    } else {
        setCurrentCookieIndex(startIndex);
    }

    for (let i = 0; i < cookies.length; i++) {
        try {
            const cookie = await getNextCookie(false, isThinkModel);
            const headers = getStandardHeaders(cookie);
            const baseUrl = getBaseUrl();
            const response = await axios.post(
                `${baseUrl}/rest/app-chat/conversations/new`,
                grokPayload,
                { headers, responseType: 'stream' }
            );

            const currentCookie = cookie.replace('sso=', '');
            const index = cookies.findIndex(c => c === currentCookie);
            if (isThinkModel) {
                setLastSuccessfulThinkCookieIndex(index);
            } else {
                setLastSuccessfulCookieIndex(index);
            }
            return response;
        } catch (error) {
            const isLastCookie = (i === cookies.length - 1);
            if (error.response && [429, 401, 403].includes(error.response.status)) {
                console.log(`Cookie ${i + 1} 失败，状态码: ${error.response.status}`);
                if (isLastCookie) {
                    console.log('已到达最后一个Cookie，重新从第1个开始尝试');
                     if (isThinkModel) {
                        setCurrentThinkCookieIndex(0);
                    } else {
                        setCurrentCookieIndex(0);
                    }
                    continue;
                }
                if (isThinkModel) {
                    incrementThinkCookieIndex();
                } else {
                    incrementCurrentCookieIndex();
                }
                continue;
            }
            throw error;
        }
    }
    throw new Error('All cookies have been tried and failed');
};

// 路由处理函数：处理 chat completions 请求
const handleChatCompletion = async (req, res) => {
    const clientIP = getClientIP(req);
    const requestPath = req.path;
    try {
        // 根据请求的模型修改Grok请求参数
        const isThinkModel = req.body.model === 'grok-3-think';
        const grokPayload = await convertToGrokFormat(req.body);
        const isStream = req.body.stream === true;

        // 获取 cookie 之前先记录日志
        console.log(formatLogMessage(
            'POST',
            clientIP,
            requestPath,
            isThinkModel ? getCurrentThinkCookieIndex() : getCurrentCookieIndex()
        ));

        const response = await makeGrokRequest(grokPayload, isStream, 0, isThinkModel);
        let cookie;
        const model_name = req.body.model; // 获取请求的模型名称

        if (isStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            let buffer = '';
            // 用于跟踪是否已进入 isThinking 块
            let thinkingBlockActive = false;

            response.data.on('data', (chunk) => {
                buffer += chunk.toString();
                while (true) {
                    const newlineIndex = buffer.indexOf('\n');
                    if (newlineIndex === -1) break;
                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);
                    if (!line.trim()) continue;

                    try {
                        if (line.startsWith('{"result":')) {
                            const data = JSON.parse(line);
                            // 处理 token 消息
                            if (data.result?.response?.token !== undefined) {
                                const token = data.result.response.token;
                                const isThinking = data.result.response.isThinking;
                                
                                if (isThinkModel) {
                                    // 当 token 为 thinking 且尚未输出开始标记时，先输出 <think> 标签
                                    if (isThinking && !thinkingBlockActive) {
                                        thinkingBlockActive = true;
                                        const thinkStartEvent = {
                                            id: `chatcmpl-${crypto.randomUUID()}`,
                                            object: 'chat.completion.chunk',
                                            created: Math.floor(Date.now() / 1000),
                                            model: model_name,
                                            choices: [
                                                {
                                                    delta: { content: "\n<think>\n" },
                                                    index: 0,
                                                    finish_reason: null
                                                }
                                            ]
                                        };
                                        res.write(`data: ${JSON.stringify(thinkStartEvent)}\n\n`);
                                    }
                                    // 当 token 不为 thinking 且正在处于 thinking 块内，则先输出 </think> 标签
                                    if (!isThinking && thinkingBlockActive) {
                                        const thinkEndEvent = {
                                            id: `chatcmpl-${crypto.randomUUID()}`,
                                            object: 'chat.completion.chunk',
                                            created: Math.floor(Date.now() / 1000),
                                            model: model_name,
                                            choices: [
                                                {
                                                    delta: { content: "\n</think>\n" },
                                                    index: 0,
                                                    finish_reason: null
                                                }
                                            ]
                                        };
                                        res.write(`data: ${JSON.stringify(thinkEndEvent)}\n\n`);
                                        thinkingBlockActive = false;
                                    }
                                }
                                if (token === '' && data.result.response.isSoftStop) {
                                    continue;  // 跳过空 token
                                }
                                const event = {
                                    id: `chatcmpl-${crypto.randomUUID()}`,
                                    object: 'chat.completion.chunk',
                                    created: Math.floor(Date.now() / 1000),
                                    model: model_name,
                                    choices: [
                                        {
                                            delta: { content: token },
                                            index: 0,
                                            finish_reason: null
                                        }
                                    ]
                                };
                                res.write(`data: ${JSON.stringify(event)}\n\n`);
                            }
                            if (data.result?.response?.finalMetadata) {
                                // 如果收到 finalMetadata 前仍处于 thinking 块中，则先输出关闭标签
                                if (isThinkModel && thinkingBlockActive) {
                                    const thinkEndEvent = {
                                        id: `chatcmpl-${crypto.randomUUID()}`,
                                        object: 'chat.completion.chunk',
                                        created: Math.floor(Date.now() / 1000),
                                        model: model_name,
                                        choices: [
                                            {
                                                delta: { content: "\n</think>\n" },
                                                index: 0,
                                                finish_reason: null
                                            }
                                        ]
                                    };
                                    res.write(`data: ${JSON.stringify(thinkEndEvent)}\n\n`);
                                    thinkingBlockActive = false;
                                }
                                const event = {
                                    id: `chatcmpl-${crypto.randomUUID()}`,
                                    object: 'chat.completion.chunk',
                                    created: Math.floor(Date.now() / 1000),
                                    model: model_name,
                                    choices: [
                                        {
                                            delta: {},
                                            index: 0,
                                            finish_reason: 'stop'
                                        }
                                    ]
                                };
                                res.write(`data: ${JSON.stringify(event)}\n\n`);
                                res.write('data: [DONE]\n\n');
                            }
                        }
                    } catch (e) {
                        console.warn('Incomplete or invalid JSON, skipping chunk', e);
                    }
                }
            });

            response.data.on('end', async () => {
                // 流结束时，如果仍处于 thinking 块中，输出结束标签
                if (thinkingBlockActive) {
                    const thinkEndEvent = {
                        id: `chatcmpl-${crypto.randomUUID()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model_name,
                        choices: [
                            {
                                delta: { content: "\n</think>\n" },
                                index: 0,
                                finish_reason: null
                            }
                        ]
                    };
                    res.write(`data: ${JSON.stringify(thinkEndEvent)}\n\n`);
                    thinkingBlockActive = false;
                }
                cookie = await getNextCookie(true, isThinkModel);
                await checkCurrentCookieQuota(cookie, isThinkModel);
                res.end();
            });
            response.data.on('error', (error) => {
                console.error(`[${new Date().toISOString()}] Stream error for IP: ${clientIP}:`, error);
                res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
                res.end();
            });

        } else {
            // 非流式响应
            let fullResponse = '';
            let buffer = '';
            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        if (line.startsWith('{"result":')) {
                            const data = JSON.parse(line);
                            if (data.result?.response?.modelResponse?.message) {
                                fullResponse = data.result.response.modelResponse.message;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse line in non-stream mode');
                    }
                }
            }
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.result?.response?.modelResponse?.message) {
                        fullResponse = data.result.response.modelResponse.message;
                    }
                } catch (e) {
                    console.warn('Failed to parse final buffer in non-stream mode');
                }
            }
            // 对于 grok-3-think 模型，在非流式响应中也添加 <think> 标签
            if (isThinkModel) {
                fullResponse = "\n<think>\n" + fullResponse + "\n</think>\n";
            }
            cookie = await getNextCookie(true, isThinkModel);
            await checkCurrentCookieQuota(cookie, isThinkModel);
            res.json({
                id: `chatcmpl-${crypto.randomUUID()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: model_name, // 返回请求中指定的模型名称
                choices: [
                    {
                        message: { role: 'assistant', content: fullResponse },
                        finish_reason: 'stop'
                    }
                ]
            });
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error for IP ${clientIP}:`, error);
        if (error.message === 'All cookies have been tried and failed') {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'All available tokens are currently rate limited'
            });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

// 新的图片生成处理函数
const handleImageGeneration = async (req, res) => {
    const clientIP = getClientIP(req);
    const requestPath = req.path;

    try {
        // 提取DALL-E 3请求中的提示词
        const prompt = req.body.prompt;

        // 构建Grok格式的请求
        const grokPayload = {
            temporary: true,
            modelName: 'grok-3',
            message: `Please generate the image: ${prompt}`,
            fileAttachments: [],
            imageAttachments: [],
            disableSearch: false,
            enableImageGeneration: true,
            returnImageBytes: false,
            returnRawGrokInXaiRequest: false,
            enableImageStreaming: true,
            imageGenerationCount: req.body.n || 2,
            forceConcise: false,
            toolOverrides: {},
            enableSideBySide: true,
            isPreset: false,
            sendFinalMetadata: true,
            customInstructions: '',
            deepsearchPreset: '',
            isReasoning: false
        };

        // 记录日志
        console.log(formatLogMessage(
            'POST',
            clientIP,
            requestPath,
            getCurrentCookieIndex()
        ));

        const response = await makeGrokRequest(grokPayload, true, 0);
        let generatedImages = [];
        let buffer = '';

        response.data.on('data', (chunk) => {
            buffer += chunk.toString();

            while (true) {
                const newlineIndex = buffer.indexOf('\n');
                if (newlineIndex === -1) break;
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                if (!line.trim()) continue;

                try {
                    if (line.startsWith('{"result":')) {
                        const data = JSON.parse(line);
                        // 检查是否包含最终的图片URL
                        if (data.result?.response?.modelResponse?.generatedImageUrls) {
                            const baseUrl = process.env.REVERSE_PROXY ? process.env.REVERSE_PROXY : 'https://assets.grok.com';
                            generatedImages = data.result.response.modelResponse.generatedImageUrls.map(url => ({
                                url: `${url.startsWith('http') ? url : `${baseUrl}/${url}`}`, // 根据URL格式添加适当的前缀
                                revised_prompt: prompt  // 添加修订后的提示词
                            }));
                            // 发送DALL-E 3格式的响应
                            res.json({
                                created: Math.floor(Date.now() / 1000),
                                data: generatedImages
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse JSON:', e);
                }
            }
        });
        response.data.on('end', async () => {
            if (generatedImages.length === 0) {
                res.json({
                    created: Math.floor(Date.now() / 1000),
                    data: []
                });
            }
            // 检查cookie额度
            const cookie = await getNextCookie();
            await checkCurrentCookieQuota(cookie);
        });

        response.data.on('error', (error) => {
            console.error(`[${new Date().toISOString()}] Stream error for IP: ${clientIP}:`, error);
            res.status(500).json({ error: 'An error occurred during image generation' });
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error for IP ${clientIP}:`, error);
        if (error.message === 'All cookies have been tried and failed') {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'All available tokens are currently rate limited'
            });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

// 导出函数
module.exports = {
    handleChatCompletion,
    handleImageGeneration
};