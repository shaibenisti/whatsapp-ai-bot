const logger = require('./logger');

/**
 * Lightweight message tracking to prevent duplicates and basic throttling
 * Much simpler than MessageQueue - just tracks recent messages and user timing
 */
class MessageTracker {
    constructor() {
        this.recentMessages = new Set(); // Track recent message IDs
        this.userLastMessage = new Map(); // Track last message time per user
        this.processedMessageIds = new Map(); // Map message IDs to timestamp when processed
        this.botStartTime = Date.now(); // Track when bot started/reconnected
        this.DUPLICATE_WINDOW_MS = 3000; // 3 seconds to catch duplicates
        this.USER_THROTTLE_MS = 1000; // 1 second minimum between messages from same user
        this.MAX_TRACKED_MESSAGES = 50; // Limit memory usage - 50 is enough for duplicate detection
        this.OLD_MESSAGE_THRESHOLD_MS = 60000; // Ignore messages older than 1 minute before bot start

        // Clean up old data periodically
        this.cleanupInterval = setInterval(() => this.cleanup(), 30000); // Every 30 seconds
    }

    /**
     * Check if message should be processed (not duplicate, not too rapid)
     * @param {Object} message - WhatsApp message object
     * @returns {boolean} - True if should process, false if should skip
     */
    shouldProcessMessage(message) {
        const messageId = this.getMessageId(message);
        const userId = message.from;
        const now = Date.now();

        // 1. Check if message is too old (reconnection flood prevention)
        const messageTimestamp = message.timestamp * 1000; // Convert to milliseconds
        const messageAge = now - messageTimestamp;
        const timeSinceBotStart = messageTimestamp - this.botStartTime;

        // Ignore messages that arrived before bot started AND are old
        if (timeSinceBotStart < -this.OLD_MESSAGE_THRESHOLD_MS) {
            logger.debug(`Skipping old message from ${userId} (${Math.round(messageAge / 1000)}s old, received ${Math.round(-timeSinceBotStart / 1000)}s before bot start)`);
            return false;
        }

        // 2. Check for duplicate
        if (this.recentMessages.has(messageId)) {
            logger.debug(`Skipping duplicate message: ${messageId}`);
            return false;
        }

        // 3. Check if already processed (persistent tracking)
        if (this.processedMessageIds.has(messageId)) {
            logger.debug(`Skipping already processed message: ${messageId}`);
            return false;
        }

        // 4. Check user throttling (simple - just reject if too fast)
        const lastMessageTime = this.userLastMessage.get(userId) || 0;
        if (now - lastMessageTime < this.USER_THROTTLE_MS) {
            logger.debug(`Throttling rapid message from ${userId}`);
            return false;
        }

        // 5. Record this message and update tracking
        this.recordMessage(messageId, userId, now);
        return true;
    }

    /**
     * Record message as processed
     */
    recordMessage(messageId, userId, timestamp) {
        // Add to recent messages (with size limit)
        this.recentMessages.add(messageId);
        if (this.recentMessages.size > this.MAX_TRACKED_MESSAGES) {
            // Remove oldest entries (Set maintains insertion order)
            const iterator = this.recentMessages.values();
            for (let i = 0; i < 25; i++) { // Remove half when limit reached
                const oldest = iterator.next().value;
                if (oldest) {
                    this.recentMessages.delete(oldest);
                }
            }
        }

        // Add to processed message IDs with timestamp
        this.processedMessageIds.set(messageId, timestamp);
        if (this.processedMessageIds.size > this.MAX_TRACKED_MESSAGES * 2) {
            // Remove oldest entries from processed map
            const entries = Array.from(this.processedMessageIds.entries())
                .sort((a, b) => a[1] - b[1]); // Sort by timestamp
            const toRemove = entries.slice(0, this.MAX_TRACKED_MESSAGES);
            toRemove.forEach(([id]) => this.processedMessageIds.delete(id));
        }

        // Update user timing
        this.userLastMessage.set(userId, timestamp);
    }

    /**
     * Generate unique message identifier
     */
    getMessageId(message) {
        // Use WhatsApp message ID if available, otherwise create from content
        return message.id?._serialized || message.id || 
               `${message.from}_${message.timestamp}_${(message.body || '').substring(0, 10)}`;
    }

    /**
     * Clean up old user timing data
     */
    cleanup() {
        const now = Date.now();
        const cutoff = now - (5 * 60 * 1000); // 5 minutes ago

        // Remove old user timing data
        for (const [userId, timestamp] of this.userLastMessage.entries()) {
            if (timestamp < cutoff) {
                this.userLastMessage.delete(userId);
            }
        }

        // Remove old processed message IDs
        for (const [messageId, timestamp] of this.processedMessageIds.entries()) {
            if (timestamp < cutoff) {
                this.processedMessageIds.delete(messageId);
            }
        }

        logger.debug(`Cleanup: ${this.userLastMessage.size} users tracked, ${this.recentMessages.size} recent messages, ${this.processedMessageIds.size} processed messages`);
    }

    /**
     * Get current tracking status
     */
    getStatus() {
        return {
            recentMessages: this.recentMessages.size,
            trackedUsers: this.userLastMessage.size,
            processedMessages: this.processedMessageIds.size
        };
    }

    /**
     * Reset the bot start time (call this when reconnecting)
     */
    resetStartTime() {
        this.botStartTime = Date.now();
        logger.info('MessageTracker: Reset bot start time for reconnection');
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.recentMessages.clear();
        this.userLastMessage.clear();
        this.processedMessageIds.clear();
    }
}

module.exports = MessageTracker;