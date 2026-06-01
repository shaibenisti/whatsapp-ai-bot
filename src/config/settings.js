/**
 * User-Configurable Settings
 *
 * This file contains all the settings you can customize for your WhatsApp bot.
 * Edit this file to change bot behavior, personality, and features.
 */

module.exports = {
    /**
     * ============================================
     * BOT PERSONALITY & BEHAVIOR
     * ============================================
     */
    personality: {
        /**
         * Bot Name - How the bot introduces itself
         * Examples: "ChatBot", "Assistant", "Support Bot", "ליאורה"
         */
        name: process.env.BOT_NAME || 'ChatBot',

        /**
         * Bot Tone - How formal/casual the bot should be
         * Options: 'professional', 'friendly', 'casual', 'formal'
         */
        tone: 'friendly',

        /**
         * Bot Role - What the bot's primary function is
         * Options: 'assistant', 'support', 'moderator', 'custom'
         */
        role: 'assistant',

        /**
         * Primary Language
         * Options: 'hebrew', 'english', 'auto' (detect from user)
         */
        primaryLanguage: 'hebrew',

        /**
         * Use Emojis - Should the bot use emojis in responses?
         */
        useEmojis: true,

        /**
         * Custom System Prompt (Advanced)
         * Leave empty to use default based on tone/role above
         * If set, this overrides the default personality
         */
        customPrompt: ''
    },

    /**
     * ============================================
     * OWNER INFORMATION
     * ============================================
     */
    owner: {
        /**
         * Owner Name - Your name or company name
         */
        name: process.env.OWNER_NAME || 'Bot Owner',

        /**
         * Contact Phone - Your phone number for escalations
         * Format: Include country code, e.g., "+1-555-1234" or "050-1234567"
         */
        phone: process.env.OWNER_PHONE || '',

        /**
         * Contact Email - Your email for support requests
         */
        email: process.env.OWNER_EMAIL || ''
    },

    /**
     * ============================================
     * FEATURES & CAPABILITIES
     * ============================================
     */
    features: {
        /**
         * Conversation Memory - Remember past conversations?
         */
        memory: {
            enabled: true,
            maxMessagesPerContact: 50,  // How many messages to remember per contact
            summaryEnabled: true         // Generate conversation summaries?
        },

        /**
         * Image Analysis - Can the bot analyze images sent by users?
         */
        visionAnalysis: {
            enabled: true,
            autoAnalyze: true  // Automatically analyze images or wait for user to ask?
        },

        /**
         * Spam Detection - Automatically detect and filter spam?
         */
        spamDetection: {
            enabled: true,
            autoBlock: false  // Automatically block spam contacts?
        },

        /**
         * Intent Classification - Classify message intent?
         * Helps bot understand if message is question, request, etc.
         */
        intentClassification: {
            enabled: true
        },

        /**
         * Response Validation - Validate AI responses before sending?
         * Prevents inappropriate or low-quality responses
         */
        responseValidation: {
            enabled: true,
            blockProfanity: true,
            minResponseLength: 5,
            maxResponseLength: 2000
        }
    },

    /**
     * ============================================
     * OPERATING HOURS
     * ============================================
     */
    operatingHours: {
        /**
         * Always Active - Bot responds 24/7?
         * If false, configure specific hours below
         */
        alwaysActive: true,

        /**
         * Active Days (0=Sunday, 6=Saturday)
         * Example: [0,1,2,3,4] = Sunday through Thursday
         */
        activeDays: [0, 1, 2, 3, 4, 5, 6],

        /**
         * Active Hours (24-hour format)
         * Only used if alwaysActive is false
         */
        startHour: 8,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,

        /**
         * Out of Hours Message - What to say when outside active hours?
         * Leave empty for default message
         */
        outOfHoursMessage: ''
    },

    /**
     * ============================================
     * RESPONSE BEHAVIOR
     * ============================================
     */
    responses: {
        /**
         * Default Responses - Fallback messages when AI fails
         */
        fallbacks: {
            general: 'תודה על ההודעה. אחזור אליך בהקדם.',
            support: 'אני כאן לעזור! תוכל לפרט מה אתה צריך?',
            personal: 'תודה! 😊'
        },

        /**
         * Greeting Message - First message sent to new contacts
         * Leave empty to skip greeting
         */
        greetingMessage: '',

        /**
         * Response Speed - How fast should the bot respond?
         * Options: 'instant', 'typing' (shows "typing..." indicator first)
         */
        responseSpeed: 'typing',

        /**
         * Typing Delay - Delay in ms before responding (makes bot feel more human)
         * Only used if responseSpeed is 'typing'
         */
        typingDelay: 1000  // 1 second
    },

    /**
     * ============================================
     * TECHNICAL SETTINGS
     * ============================================
     */
    technical: {
        /**
         * Web Interface Port
         */
        webPort: process.env.WEB_PORT || 3000,

        /**
         * Auto Open Browser - Open browser automatically when QR code is ready?
         */
        autoOpenBrowser: process.env.NODE_ENV !== 'production',

        /**
         * Log Level - How much logging detail?
         * Options: 'error', 'warn', 'info', 'debug'
         */
        logLevel: process.env.LOG_LEVEL || 'info',

        /**
         * Ollama URL - Where is your Ollama server running?
         */
        ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',

        /**
         * AI Models - Which Ollama models to use
         */
        aiModels: {
            text: 'gpt-oss:120b',     // For conversations
            vision: 'llava:34b',       // For image analysis
            intent: 'gpt-oss:120b'     // For intent classification
        },

        /**
         * Database Path
         */
        databasePath: process.env.DB_PATH || './database/contacts.db',

        /**
         * Timezone
         */
        timezone: process.env.TIMEZONE || 'Asia/Jerusalem'
    },

    /**
     * ============================================
     * ADVANCED CUSTOMIZATION
     * ============================================
     */
    advanced: {
        /**
         * Custom Personality Presets
         * Define multiple personalities and switch between them
         */
        personalityPresets: {
            professional: {
                tone: 'formal',
                useEmojis: false,
                prompt: 'You are a professional AI assistant. Respond formally and concisely.'
            },
            friendly: {
                tone: 'casual',
                useEmojis: true,
                prompt: 'You are a friendly AI assistant. Be warm and helpful, use emojis when appropriate.'
            },
            supportAgent: {
                tone: 'professional',
                useEmojis: true,
                prompt: 'You are a customer support agent. Be helpful, patient, and professional.'
            }
        },

        /**
         * Active Preset - Which preset to use?
         * Options: 'professional', 'friendly', 'supportAgent', or 'custom'
         * If 'custom', uses personality settings from above
         */
        activePreset: 'custom'
    }
};