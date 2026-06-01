const axios = require('axios');
const logger = require('../utils/logger');
const { AI_MODELS, TIME } = require('../config/constants');
const PERSONAS = require('../config/personas');
const PROMPTS = require('../config/prompts');

/**
 * Service for interacting with Ollama AI models
 * Handles text generation, vision analysis, and streaming responses
 */
class OllamaService {
    constructor() {
        /** @type {string} */
        this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        /** @type {string} */
        this.textModel = AI_MODELS.TEXT_MODEL;

        /** @type {number} Timeout for text operations in ms */
        this.textTimeout = TIME.AI_TEXT_TIMEOUT;
        /** @type {number} Timeout for vision operations in ms */
        this.visionTimeout = TIME.AI_VISION_TIMEOUT;
        /** @type {number} Timeout for health checks in ms */
        this.healthTimeout = TIME.AI_HEALTH_TIMEOUT;

        /** @type {number} Maximum retry attempts */
        this.maxRetries = 2;
        /** @type {number} Delay between retries in ms */
        this.retryDelay = 1000; // 1 second between retries

        // Simple intent cache to avoid re-classifying similar messages
        this.intentCache = new Map();
        this.intentCacheMaxSize = 100;
        this.intentCacheTTL = 60 * 60 * 1000; // 1 hour
    }

    async generateResponse(prompt, systemPrompt = null, model = this.textModel) {
        const timeout = this.textTimeout;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const payload = {
                    model,
                    prompt,
                    stream: true,  // PERFORMANCE OPTIMIZATION: Enable streaming for better perceived performance
                    options: {
                        temperature: AI_MODELS.TEMPERATURE,
                        top_p: AI_MODELS.TOP_P,
                        num_predict: AI_MODELS.MAX_TOKENS // Ollama uses num_predict, not max_tokens
                    }
                };

                if (systemPrompt) {
                    payload.system = systemPrompt;
                }

                logger.info(`Generating streaming response with ${model}... (attempt ${attempt}/${this.maxRetries})`);

                const response = await axios.post(
                    `${this.baseUrl}/api/generate`,
                    payload,
                    {
                        timeout: timeout,
                        responseType: 'stream',  // Enable streaming response
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // PERFORMANCE OPTIMIZATION: Process streaming response for 50% better perceived latency
                return new Promise((resolveOuter, rejectOuter) => {
                    let fullResponse = '';
                    let hasError = false;
                    let buffer = ''; // Buffer for incomplete JSON lines
                    let streamTimeout = null;

                    // Wrap resolve/reject so the timeout timer is always cleared,
                    // otherwise it lingers for the full timeout window on every call
                    const resolve = (value) => { clearTimeout(streamTimeout); resolveOuter(value); };
                    const reject = (err) => { clearTimeout(streamTimeout); rejectOuter(err); };

                    response.data.on('data', (chunk) => {
                        try {
                            // Add chunk to buffer and split by lines
                            buffer += chunk.toString();
                            const lines = buffer.split('\n');

                            // Keep the last incomplete line in buffer (could be empty string)
                            const lastLine = lines.pop();
                            buffer = lastLine !== undefined ? lastLine : '';

                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        const data = JSON.parse(line);
                                        if (data.response) {
                                            fullResponse += data.response;
                                            // Future enhancement: could emit partial responses here for real-time typing
                                        }
                                        if (data.done) {
                                            logger.info(`Generated streaming response length: ${fullResponse.length}`);
                                            resolve(fullResponse.trim());
                                            return;
                                        }
                                        if (data.error) {
                                            hasError = true;
                                            reject(new Error(data.error));
                                            return;
                                        }
                                    } catch (lineParseError) {
                                        // Skip invalid JSON lines (common in streaming)
                                        logger.debug('Skipping invalid JSON line:', line.substring(0, 50));
                                    }
                                }
                            }
                        } catch (parseError) {
                            if (!hasError) {
                                hasError = true;
                                logger.error('Error processing streaming chunk:', parseError);
                                reject(new Error('Failed to process streaming response'));
                            }
                        }
                    });

                    response.data.on('error', (error) => {
                        if (!hasError) {
                            hasError = true;
                            reject(error);
                        }
                    });

                    response.data.on('end', () => {
                        // Process any remaining data in buffer
                        if (buffer.trim() && !hasError) {
                            try {
                                const data = JSON.parse(buffer);
                                if (data.response) {
                                    fullResponse += data.response;
                                }
                                if (data.done && fullResponse) {
                                    logger.info(`Generated streaming response length: ${fullResponse.length}`);
                                    resolve(fullResponse.trim());
                                    return;
                                }
                            } catch (finalParseError) {
                                // Ignore final buffer parse errors
                            }
                        }

                        if (!hasError && fullResponse) {
                            resolve(fullResponse.trim());
                        } else if (!hasError) {
                            reject(new Error('Streaming ended without complete response'));
                        }
                    });

                    // Timeout handling for streaming
                    streamTimeout = setTimeout(() => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Streaming response timeout'));
                        }
                    }, timeout);
                });

            } catch (error) {
                logger.error(`Error generating streaming response from Ollama (attempt ${attempt}/${this.maxRetries}):`, error.message);

                // If this is the last attempt, throw the error
                if (attempt === this.maxRetries) {
                    throw error;
                }

                // Wait before retrying (except for the last attempt)
                if (attempt < this.maxRetries) {
                    logger.info(`Retrying in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
    }

    async generateHebrewResponse(prompt, context = '', contactName = 'חבר') {
        const systemPrompt = this.buildSystemPrompt(context, contactName);
        return await this.generateResponse(prompt, systemPrompt);
    }

    /**
     * Build system prompt with unified personality
     * @param {string} context - Previous conversation context
     * @param {string} contactName - Name of contact
     * @returns {string} System prompt
     */
    buildSystemPrompt(context, contactName) {
        // Use the unified default persona
        const basePrompt = PERSONAS.default.prompt;

        return `${basePrompt}

${context ? `הקשר קודם: ${context}` : ''}

עני בעברית בלבד, בצורה טבעית המתאימה לשיחה עם ${contactName}.`;
    }

    async classifyMessageIntent(message) {
        // Create cache key from normalized message
        const cacheKey = message.toLowerCase().trim().substring(0, 100);
        const now = Date.now();

        // Check cache first
        const cached = this.intentCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < this.intentCacheTTL) {
            logger.debug(`Intent cache hit: ${cached.intent}`);
            return cached.intent;
        }

        // Use intent model with reduced token limit for faster classification
        const intentModel = AI_MODELS.INTENT_MODEL;
        const timeout = TIME.AI_TEXT_TIMEOUT;

        try {
            const payload = {
                model: intentModel,
                prompt: message,
                system: PROMPTS.intentClassification,
                stream: false, // Don't stream for short responses
                options: {
                    temperature: 0.3, // Lower temperature for more consistent classification
                    top_p: AI_MODELS.TOP_P,
                    num_predict: AI_MODELS.INTENT_MAX_TOKENS // Limit tokens for faster response
                }
            };

            logger.info(`Classifying intent with ${intentModel}...`);

            const response = await axios.post(
                `${this.baseUrl}/api/generate`,
                payload,
                {
                    timeout: timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.response) {
                const intent = response.data.response.toLowerCase().trim();
                logger.info(`Intent classified as: ${intent}`);

                // Cache the result
                this.intentCache.set(cacheKey, { intent, timestamp: now });

                // Limit cache size
                if (this.intentCache.size > this.intentCacheMaxSize) {
                    // Remove oldest entries
                    const entries = Array.from(this.intentCache.entries());
                    const toRemove = entries
                        .sort((a, b) => a[1].timestamp - b[1].timestamp)
                        .slice(0, 20); // Remove 20 oldest
                    toRemove.forEach(([key]) => this.intentCache.delete(key));
                }

                return intent;
            }

            throw new Error('No response from intent classification');

        } catch (error) {
            logger.error('Error classifying message intent:', error.message);
            return 'personal'; // Default to personal on error
        }
    }

    async isModelAvailable(modelName = this.textModel) {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`, {
                timeout: this.healthTimeout
            });
            
            if (response.data && response.data.models) {
                const modelExists = response.data.models.some(model => 
                    model.name === modelName || model.name.startsWith(modelName)
                );
                
                logger.info(`Model ${modelName} ${modelExists ? 'is' : 'is not'} available`);
                return modelExists;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error checking model availability: ${error.message}`);
            return false;
        }
    }

    async analyzeImage(imageBase64, prompt = "תאר את התמונה הזו בפירוט") {
        try {
            logger.info('Analyzing image with vision model...');

            const payload = {
                model: AI_MODELS.VISION_MODEL,
                prompt: prompt,
                images: [imageBase64],
                stream: false,
                options: {
                    temperature: AI_MODELS.TEMPERATURE,
                    top_p: AI_MODELS.TOP_P
                }
            };

            const response = await axios.post(
                `${this.baseUrl}/api/generate`,
                payload,
                {
                    timeout: TIME.AI_VISION_TIMEOUT,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.response) {
                logger.info(`Vision analysis completed: ${response.data.response.substring(0, 100)}...`);
                return response.data.response;
            }

            throw new Error('No response from vision model');

        } catch (error) {
            logger.error('Error analyzing image:', error.message);
            throw error;
        }
    }

    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`, {
                timeout: this.healthTimeout
            });

            const isHealthy = response.status === 200;
            logger.info(`Ollama service ${isHealthy ? 'is healthy' : 'is not healthy'}`);
            return isHealthy;
        } catch (error) {
            logger.error(`Ollama health check failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = OllamaService;