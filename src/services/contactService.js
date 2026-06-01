const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { MEMORY, VALIDATION } = require('../config/constants');

/**
 * Service for managing contacts and conversations
 */
class ContactService {
    constructor() {
        /** @type {sqlite3.Database|null} */
        this.db = null;
        /** @type {string} */
        this.dbPath = path.join(__dirname, '../../database/contacts.db');
    }

    /**
     * Initialize database connection and create tables
     * @returns {Promise<void>}
     */
    async initialize() {
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            logger.info(`Created database directory: ${dbDir}`);
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Error opening database:', err);
                    reject(err);
                } else {
                    logger.info('Connected to contacts database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const createContactsTable = `
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL CHECK(length(name) > 0),
                phone TEXT CHECK(phone IS NULL OR length(phone) >= 10),
                relationship_type TEXT DEFAULT 'unknown'
                    CHECK(relationship_type IN ('family', 'friend', 'business', 'unknown', 'spam')),
                is_spam BOOLEAN DEFAULT 0 CHECK(is_spam IN (0, 1)),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createConversationsTable = `
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id TEXT,
                message_id TEXT,
                message_content TEXT,
                message_type TEXT,
                is_from_contact BOOLEAN,
                intent TEXT,
                response_generated TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contact_id) REFERENCES contacts (id)
            )
        `;

        // Critical performance indexes
        const createIndexes = [
            `CREATE INDEX IF NOT EXISTS idx_conversations_contact_timestamp
             ON conversations(contact_id, timestamp DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_contacts_relationship
             ON contacts(relationship_type)`,
            `CREATE INDEX IF NOT EXISTS idx_conversations_timestamp
             ON conversations(timestamp DESC)`
        ];

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(createContactsTable);
                this.db.run(createConversationsTable);

                // Create performance indexes
                let indexCount = 0;
                createIndexes.forEach((indexSQL, i) => {
                    this.db.run(indexSQL, (err) => {
                        if (err) {
                            logger.error(`Error creating index ${i}:`, err);
                        } else {
                            logger.info(`Created index ${i + 1}/${createIndexes.length}`);
                        }
                        indexCount++;
                        if (indexCount === createIndexes.length) {
                            logger.info('Database tables and indexes initialized');
                            resolve();
                        }
                    });
                });
            });
        });
    }

    async getOrCreateContact(contactId, contactInfo) {
        return new Promise((resolve, reject) => {
            // First try to get existing contact
            this.db.get(
                'SELECT * FROM contacts WHERE id = ?',
                [contactId],
                (err, row) => {
                    if (err) {
                        logger.error('Error fetching contact:', err);
                        reject(err);
                        return;
                    }

                    if (row) {
                        // Update existing contact info
                        this.db.run(
                            `UPDATE contacts SET 
                                name = COALESCE(?, name),
                                phone = COALESCE(?, phone),
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?`,
                            [contactInfo?.name, contactInfo?.phone, contactId],
                            (err) => {
                                if (err) {
                                    logger.error('Error updating contact:', err);
                                    reject(err);
                                } else {
                                    resolve(row);
                                }
                            }
                        );
                    } else {
                        // Create new contact - validate input first
                        const rawName = this.sanitizeInput(contactInfo?.name);
                        const sanitizedName = (rawName && rawName.length > 0) ? rawName : 'Unknown Contact';
                        const sanitizedPhone = this.sanitizePhoneNumber(contactInfo?.phone);
                        const relationshipType = this.guessRelationshipType(contactInfo);
                        
                        this.db.run(
                            `INSERT INTO contacts (id, name, phone, relationship_type)
                            VALUES (?, ?, ?, ?)`,
                            [contactId, sanitizedName, sanitizedPhone, relationshipType],
                            function(err) {
                                if (err) {
                                    logger.error('Error creating contact:', err);
                                    reject(err);
                                } else {
                                    logger.debug(`Created contact: ${contactId}`);
                                    resolve({
                                        id: contactId,
                                        name: sanitizedName,
                                        phone: sanitizedPhone,
                                        relationship_type: relationshipType,
                                        is_spam: 0
                                    });
                                }
                            }
                        );
                    }
                }
            );
        });
    }

    guessRelationshipType(contactInfo) {
        if (!contactInfo || !contactInfo.name) return 'unknown';

        const name = contactInfo.name.toLowerCase();
        const familyKeywords = ['אמא', 'אבא', 'אח', 'אחות', 'דוד', 'דודה', 'mom', 'dad', 'brother', 'sister'];

        if (familyKeywords.some(keyword => name.includes(keyword))) {
            return 'family';
        }

        return 'friend';
    }

    sanitizeInput(input) {
        if (!input || typeof input !== 'string') return null;
        
        // Remove dangerous characters but keep Hebrew, English, numbers, and common punctuation
        return input
            .replace(/[<>\"'`]/g, '') // Remove potentially dangerous HTML/SQL injection chars
            .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
            .trim()
            .substring(0, VALIDATION.MAX_NAME_LENGTH);
    }

    sanitizePhoneNumber(phone) {
        if (!phone || typeof phone !== 'string') return null;

        // Keep only digits, +, -, (, ), and spaces
        const cleaned = phone
            .replace(/[^\d\+\-\(\)\s]/g, '')
            .trim()
            .substring(0, VALIDATION.MAX_PHONE_LENGTH);

        // DB constraint requires length >= 10; treat anything shorter as unknown
        if (cleaned.replace(/\D/g, '').length < 10) return null;

        return cleaned;
    }

    async updateContactRelationship(contactId, relationshipType, isBusiness = false, isSpam = false) {
        return new Promise((resolve, reject) => {
            // Validate inputs
            if (!contactId || typeof contactId !== 'string') {
                reject(new Error('Invalid contact ID'));
                return;
            }

            const validRelationshipTypes = ['family', 'friend', 'business', 'unknown', 'spam'];
            if (!validRelationshipTypes.includes(relationshipType)) {
                reject(new Error(`Invalid relationship type: ${relationshipType}`));
                return;
            }

            this.db.run(
                `UPDATE contacts SET
                    relationship_type = ?,
                    is_spam = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [relationshipType, isSpam ? 1 : 0, contactId],
                function(err) {
                    if (err) {
                        logger.error('Error updating contact relationship:', err);
                        reject(err);
                    } else if (this.changes === 0) {
                        logger.warn(`No contact found to update: ${contactId}`);
                        reject(new Error('Contact not found'));
                    } else {
                        logger.debug(`Updated contact ${contactId}: ${relationshipType}`);
                        resolve();
                    }
                }
            );
        });
    }

    async logConversation(contactId, messageId, messageContent, messageType, isFromContact, intent = null, responseGenerated = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO conversations 
                (contact_id, message_id, message_content, message_type, is_from_contact, intent, response_generated)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [contactId, messageId, messageContent, messageType, isFromContact ? 1 : 0, intent, responseGenerated],
                function(err) {
                    if (err) {
                        logger.error('Error logging conversation:', err);
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    async getConversationHistory(contactId, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM conversations 
                WHERE contact_id = ? 
                ORDER BY timestamp DESC 
                LIMIT ?`,
                [contactId, limit],
                (err, rows) => {
                    if (err) {
                        logger.error('Error fetching conversation history:', err);
                        reject(err);
                    } else {
                        resolve(rows.reverse()); // Return in chronological order
                    }
                }
            );
        });
    }

    async getContact(contactId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM contacts WHERE id = ?',
                [contactId],
                (err, row) => {
                    if (err) {
                        logger.error('Error fetching contact:', err);
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    async isSpamContact(contactId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT is_spam FROM contacts WHERE id = ?',
                [contactId],
                (err, row) => {
                    if (err) {
                        logger.error('Error checking spam status:', err);
                        reject(err);
                    } else {
                        resolve(row ? Boolean(row.is_spam) : false);
                    }
                }
            );
        });
    }

    async cleanupOldData() {
        return new Promise((resolve, reject) => {
            // Clean up old conversations (keep last 50 per contact)
            this.db.run(`
                DELETE FROM conversations
                WHERE id NOT IN (
                    SELECT id FROM (
                        SELECT id, ROW_NUMBER() OVER (
                            PARTITION BY contact_id
                            ORDER BY timestamp DESC
                        ) as row_num
                        FROM conversations
                    ) WHERE row_num <= ?
                )
            `, [MEMORY.CONVERSATION_RETENTION_LIMIT], (err) => {
                if (err) {
                    logger.error('Error cleaning up conversations:', err);
                    reject(err);
                } else {
                    logger.info('Cleaned up old conversations');
                    resolve();
                }
            });
        });
    }

    async getDatabaseStats() {
        return new Promise((resolve, reject) => {
            const stats = {};
            let completed = 0;
            const totalQueries = 2;

            const checkComplete = () => {
                completed++;
                if (completed === totalQueries) {
                    resolve(stats);
                }
            };

            this.db.serialize(() => {
                this.db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
                    if (err) {
                        logger.error('Error counting contacts:', err);
                        reject(err);
                    } else {
                        stats.contacts = row.count;
                        checkComplete();
                    }
                });

                this.db.get('SELECT COUNT(*) as count FROM conversations', (err, row) => {
                    if (err) {
                        logger.error('Error counting conversations:', err);
                        reject(err);
                    } else {
                        stats.conversations = row.count;
                        checkComplete();
                    }
                });
            });
        });
    }

    async close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    logger.error('Error closing database:', err);
                } else {
                    logger.info('Database connection closed');
                }
            });
        }
    }
}

module.exports = ContactService;