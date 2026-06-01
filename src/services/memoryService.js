const logger = require('../utils/logger');
const { MEMORY } = require('../config/constants');

/**
 * Enhanced Memory Service for better conversation context
 * Provides intelligent context retrieval and summarization
 */
class MemoryService {
    constructor(contactService, ollamaService) {
        /** @type {ContactService} */
        this.contacts = contactService;
        /** @type {OllamaService} */
        this.ollama = ollamaService;

        // Cache for conversation summaries to avoid regenerating
        this.summaryCache = new Map();

        // Cleanup old cache entries every 30 minutes
        setInterval(() => this.cleanupCache(), 30 * 60 * 1000);
    }

    /**
     * Get intelligent conversation context for a contact
     * Includes recent messages, relationship info, and summary if needed
     * @param {string} contactId - Contact ID
     * @param {Object} contact - Contact object
     * @returns {Promise<Object>} Context object with history and metadata
     */
    async getConversationContext(contactId, contact) {
        try {
            // Get recent conversation history
            const recentMessages = await this.contacts.getConversationHistory(
                contactId,
                MEMORY.SHORT_TERM_MESSAGES
            );

            // Get extended history for potential summarization
            const extendedMessages = await this.contacts.getConversationHistory(
                contactId,
                MEMORY.LONG_TERM_MESSAGES
            );

            // Build context object
            const context = {
                recentMessages,
                totalMessages: extendedMessages.length,
                contactName: contact.name || 'משתמש',
                relationshipType: contact.relationship_type || 'unknown',
                isFirstContact: recentMessages.length === 0,
                formattedContext: this.formatMessageHistory(recentMessages, contact),
                summary: null
            };

            // If conversation is long, generate or retrieve summary
            if (extendedMessages.length >= MEMORY.SUMMARY_TRIGGER_COUNT) {
                context.summary = await this.getOrCreateSummary(contactId, extendedMessages);
                context.formattedContext = this.combineContextWithSummary(
                    context.formattedContext,
                    context.summary
                );
            }

            logger.debug(`Built context for ${contactId}: ${recentMessages.length} recent, ${extendedMessages.length} total messages`);
            return context;

        } catch (error) {
            logger.error('Error building conversation context:', error);
            // Return basic context on error
            return {
                recentMessages: [],
                totalMessages: 0,
                contactName: contact.name || 'משתמש',
                relationshipType: contact.relationship_type || 'unknown',
                isFirstContact: true,
                formattedContext: '',
                summary: null
            };
        }
    }

    /**
     * Format message history into readable context string
     * @private
     */
    formatMessageHistory(messages, contact) {
        if (!messages || messages.length === 0) {
            return '';
        }

        const contactName = contact.name || 'משתמש';
        const botName = process.env.BOT_NAME || 'העוזר';
        return messages
            .map(conv => {
                const sender = conv.is_from_contact ? contactName : botName;
                const timestamp = new Date(conv.timestamp).toLocaleString('he-IL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit'
                });
                return `[${timestamp}] ${sender}: ${conv.message_content}`;
            })
            .join('\n');
    }

    /**
     * Get or create conversation summary for long conversations
     * @private
     */
    async getOrCreateSummary(contactId, messages) {
        try {
            // Check cache first
            const cached = this.summaryCache.get(contactId);
            if (cached && cached.messageCount === messages.length) {
                logger.debug(`Using cached summary for ${contactId}`);
                return cached.summary;
            }

            // Get messages older than recent window for summarization
            const messagesToSummarize = messages.slice(0, -MEMORY.SHORT_TERM_MESSAGES);

            if (messagesToSummarize.length < 10) {
                return null; // Not enough to summarize
            }

            logger.info(`Generating conversation summary for ${contactId} (${messagesToSummarize.length} messages)`);

            // Build conversation text
            const botName = process.env.BOT_NAME || 'העוזר';
            const conversationText = messagesToSummarize
                .map(m => `${m.is_from_contact ? 'משתמש' : botName}: ${m.message_content}`)
                .join('\n');

            // Generate summary using AI
            const summaryPrompt = `סכם את השיחה הבאה בצורה תמציתית. התמקד בנקודות מפתח, בקשות, והחלטות שהתקבלו:

${conversationText}

ספק סיכום של 3-5 משפטים בעברית:`;

            const summary = await this.ollama.generateResponse(summaryPrompt);

            // Cache the summary
            this.summaryCache.set(contactId, {
                summary,
                messageCount: messages.length,
                timestamp: Date.now()
            });

            return summary;

        } catch (error) {
            logger.error('Error generating conversation summary:', error);
            return null;
        }
    }

    /**
     * Combine recent context with summary
     * @private
     */
    combineContextWithSummary(recentContext, summary) {
        if (!summary) {
            return recentContext;
        }

        return `=== סיכום שיחות קודמות ===
${summary}

=== הודעות אחרונות ===
${recentContext}`;
    }

    /**
     * Store key information about contact for future reference
     * @param {string} contactId - Contact ID
     * @param {string} key - Information key (e.g., 'preferences', 'requirements')
     * @param {string} value - Information value
     */
    async storeContactInfo(contactId, key, value) {
        try {
            // Store as a note in the contacts database
            const contact = await this.contacts.getContact(contactId);
            const currentNotes = contact.notes || '';

            // Parse existing notes as JSON if possible, otherwise start fresh
            let notesObj = {};
            try {
                notesObj = JSON.parse(currentNotes);
            } catch {
                // Notes aren't JSON, keep as is in 'legacy' key
                if (currentNotes) {
                    notesObj.legacy = currentNotes;
                }
            }

            // Add new information
            notesObj[key] = value;
            notesObj.lastUpdated = new Date().toISOString();

            // Update contact with new notes
            await this.contacts.db.run(
                'UPDATE contacts SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(notesObj), contactId]
            );

            logger.debug(`Stored ${key} for contact ${contactId}`);

        } catch (error) {
            logger.error('Error storing contact info:', error);
        }
    }

    /**
     * Retrieve stored information about contact
     * @param {string} contactId - Contact ID
     * @param {string} key - Information key
     * @returns {Promise<string|null>}
     */
    async getContactInfo(contactId, key) {
        try {
            const contact = await this.contacts.getContact(contactId);
            if (!contact || !contact.notes) {
                return null;
            }

            try {
                const notesObj = JSON.parse(contact.notes);
                return notesObj[key] || null;
            } catch {
                // Notes aren't JSON
                return null;
            }

        } catch (error) {
            logger.error('Error retrieving contact info:', error);
            return null;
        }
    }

    /**
     * Extract and store important information from conversation
     * Uses AI to identify key facts worth remembering
     * @param {string} contactId - Contact ID
     * @param {string} messageText - Message content
     * @param {Object} contact - Contact object
     */
    async extractAndStoreKeyInfo(contactId, messageText, contact) {
        try {
            // Use AI to identify if there's important info to remember
            const extractionPrompt = `נתח את ההודעה הבאה וזהה אם יש מידע חשוב לזכור על המשתמש (העדפות, דרישות, לוחות זמנים, וכו'):

הודעה: "${messageText}"

אם יש מידע חשוב, השב בפורמט JSON:
{"hasInfo": true, "category": "category_name", "value": "information_value"}

אם אין מידע חשוב לזכור, השב:
{"hasInfo": false}`;

            const response = await this.ollama.generateResponse(extractionPrompt);

            // Try to parse response
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                const extracted = JSON.parse(match[0]);

                if (extracted.hasInfo) {
                    await this.storeContactInfo(contactId, extracted.category, extracted.value);
                    logger.info(`Extracted and stored ${extracted.category} for ${contact.name || contactId}`);
                }
            }

        } catch (error) {
            // Non-critical feature, just log and continue
            logger.debug('Could not extract key info (non-critical):', error.message);
        }
    }

    /**
     * Clean up old cache entries
     * @private
     */
    cleanupCache() {
        const now = Date.now();
        const maxAge = 2 * 60 * 60 * 1000; // 2 hours

        for (const [contactId, cached] of this.summaryCache.entries()) {
            if (now - cached.timestamp > maxAge) {
                this.summaryCache.delete(contactId);
            }
        }

        logger.debug(`Cache cleanup: ${this.summaryCache.size} summaries cached`);
    }

    /**
     * Get memory statistics
     */
    getStats() {
        return {
            cachedSummaries: this.summaryCache.size,
            shortTermLimit: MEMORY.SHORT_TERM_MESSAGES,
            longTermLimit: MEMORY.LONG_TERM_MESSAGES
        };
    }
}

module.exports = MemoryService;