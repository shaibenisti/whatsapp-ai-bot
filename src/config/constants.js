// Application Constants - Centralized Magic Numbers
module.exports = {
    // Time constants (in milliseconds)
    TIME: {
        MINUTES_IN_HOUR: 60,
        HOURS_IN_DAY: 24,
        MS_IN_SECOND: 1000,
        MS_IN_MINUTE: 60 * 1000,
        MS_IN_HOUR: 60 * 60 * 1000,
        MS_IN_DAY: 24 * 60 * 60 * 1000,
        FILE_CLEANUP_HOURS: 24,
        AI_TEXT_TIMEOUT: 180000,        // 3 minutes
        AI_VISION_TIMEOUT: 180000,      // 3 minutes
        AI_HEALTH_TIMEOUT: 10000        // 10 seconds
    },
    
    // File size limits
    FILE_SIZE: {
        LOG_MAX_SIZE: 5 * 1024 * 1024, // 5MB
        MAX_LOG_FILES: 10
    },

    // AI Models
    AI_MODELS: {
        TEXT_MODEL: 'gpt-oss:120b',
        INTENT_MODEL: 'gpt-oss:120b',
        VISION_MODEL: 'llava:34b',
        TEMPERATURE: 0.7,
        TOP_P: 0.9,
        MAX_TOKENS: 2048,
        INTENT_MAX_TOKENS: 50 // Intent responses should be very short
    },

    // Weekend logic
    WEEKEND: {
        WEEKEND_DAYS: [5, 6], // Friday, Saturday
    },

    // Memory and conversation settings
    MEMORY: {
        SHORT_TERM_MESSAGES: 10,        // Recent messages for immediate context
        LONG_TERM_MESSAGES: 50,         // Extended history for deeper context
        SUMMARY_TRIGGER_COUNT: 20,      // When to create conversation summary
        MAX_CONTEXT_TOKENS: 4000,       // Approximate token limit for context
        DAYS_TO_KEEP_HISTORY: 90,       // Keep full history for 90 days
        CONVERSATION_RETENTION_LIMIT: 50 // Messages to keep per contact
    },

    // Input validation limits
    VALIDATION: {
        MAX_NAME_LENGTH: 100,
        MAX_PHONE_LENGTH: 20
    },
};