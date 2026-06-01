const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class WhatsAppService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.isReady = false;
    }

    async initialize() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'liora-bot',
                dataPath: './database/whatsapp-auth'
            }),
            puppeteer: {
                headless: true,
                ...(process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH }),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ],
                handleSIGINT: false, // Let Node.js handle SIGINT
                handleSIGTERM: false, // Let Node.js handle SIGTERM
                handleSIGHUP: false
            },
            // Increase timeout for stability
            qrTimeoutMs: 60000,
            authTimeoutMs: 60000,
            restartOnAuthFail: true
        });

        this.setupEventListeners();

        logger.info('Initializing WhatsApp client...');
        await this.client.initialize();
    }

    setupMessageHandlers() {
        // Remove existing listeners to avoid duplicates
        this.client.removeAllListeners('message');
        this.client.removeAllListeners('message_create');

        // Use message_create event (fires for all messages including sent)
        this.client.on('message_create', async (message) => {
            try {
                // Skip our own messages
                if (message.fromMe) {
                    return;
                }

                logger.info(`📨 Message received from ${message.from}, type=${message.type}`);
                await this.handleIncomingMessage(message);
            } catch (error) {
                logger.error('Error in message handler:', error);
            }
        });

        logger.info('Message handler registered successfully');
    }

    async handleIncomingMessage(message) {
        // Filter out status broadcasts and own messages
        if (message.from === 'status@broadcast' || message.fromMe) {
            logger.debug(`Ignoring ${message.fromMe ? 'own' : 'status'} message`);
            return;
        }

        // Filter group messages by ID pattern
        if (message.from.includes('@g.us')) {
            logger.debug(`Ignoring group message from ${message.from}`);
            return;
        }

        // Get chat and check if it's a group
        let chat;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                chat = await message.getChat();
                break;
            } catch (chatError) {
                if (chatError.message && chatError.message.includes('Execution context was destroyed')) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        logger.warn(`Execution context destroyed, retrying getChat (${retryCount}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    } else {
                        logger.error('Max retries reached for getChat, skipping message');
                        return;
                    }
                } else {
                    throw chatError;
                }
            }
        }

        if (chat.isGroup) {
            logger.info(`Ignoring group message from group: ${chat.name || 'Unknown Group'} (${message.from})`);
            return;
        }

        logger.info(`✅ Processing message from ${message.from}: ${message.type}`);
        this.emit('message', message);
    }

    setupEventListeners() {
        let loadingComplete = false;
        let authenticated = false;
        let readyTimeout = null;

        const checkAndEmitReady = () => {
            // If loading is complete and authenticated, but ready hasn't fired yet
            if (loadingComplete && authenticated && !this.isReady) {
                this.isReady = true;
                // Re-register message handlers now that client is fully ready
                this.setupMessageHandlers();
                logger.info('✅ WhatsApp client is ready!');
                this.emit('ready');
            }
        };

        this.client.on('qr', (qr) => {
            const webPort = process.env.WEB_PORT || 3000;
            logger.info(`QR Code received - check your browser at http://localhost:${webPort}`);
            // QR code is displayed in browser only, not in terminal
            this.emit('qr', qr);
        });

        this.client.on('loading_screen', (percent, message) => {
            logger.info(`Loading WhatsApp Web: ${percent}% - ${message}`);

            // When loading reaches 100%, mark as complete and check ready
            if (percent === 100) {
                loadingComplete = true;
                logger.info('Loading complete - waiting for ready event...');

                // Give the ready event 3 seconds to fire naturally
                // If it doesn't, we'll trigger it ourselves
                clearTimeout(readyTimeout);
                readyTimeout = setTimeout(() => {
                    checkAndEmitReady();
                }, 3000);
            }
        });

        this.client.on('ready', () => {
            // Clear the timeout since ready fired naturally
            clearTimeout(readyTimeout);
            if (!this.isReady) {
                this.isReady = true;
                // Re-register message handlers now that client is fully ready
                this.setupMessageHandlers();
                logger.info('✅ WhatsApp client is ready!');
                this.emit('ready');
            }
        });

        this.client.on('authenticated', () => {
            authenticated = true;
            logger.info('WhatsApp client authenticated');
            logger.info('Waiting for WhatsApp to finish loading...');
            this.emit('authenticated');

            // Also check ready after authentication
            setTimeout(() => {
                checkAndEmitReady();
            }, 3000);
        });

        this.client.on('auth_failure', (msg) => {
            logger.error('Authentication failed:', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.isReady = false;
            logger.warn('WhatsApp client disconnected:', reason);
            this.emit('disconnected', reason);
        });

        this.client.on('change_state', (state) => {
            logger.debug(`WhatsApp client state changed to: ${state}`);
        });

        // Initial setup of message handlers (re-registered when client becomes ready)
        this.setupMessageHandlers();
    }

    async sendMessage(chatId, message) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            // Try to send message with options to skip sendSeen
            const response = await this.client.sendMessage(chatId, message, { sendSeen: false });
            logger.debug(`Message sent to ${chatId}`);
            return response;
        } catch (error) {
            // If sendSeen option failed, try without it
            if (error.message && error.message.includes('markedUnread')) {
                logger.warn('Retrying message send without sendSeen...');
                try {
                    const response = await this.client.sendMessage(chatId, message);
                    logger.debug(`Message sent to ${chatId} (retry succeeded)`);
                    return response;
                } catch (retryError) {
                    logger.error('Retry also failed:', retryError.message);
                }
            }
            logger.error('Error sending message:', error.message);
            throw error;
        }
    }

    async sendMedia(chatId, mediaPath, caption = '') {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const media = MessageMedia.fromFilePath(mediaPath);
            const response = await this.client.sendMessage(chatId, media, { caption });
            logger.debug(`Media sent to ${chatId}: ${mediaPath}`);
            return response;
        } catch (error) {
            logger.error('Error sending media:', error);
            throw error;
        }
    }

    async getContactInfo(contactId) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            // Try to get contact and chat info, but handle errors gracefully
            let contact, chat;
            try {
                contact = await this.client.getContactById(contactId);
            } catch (contactError) {
                logger.warn(`Could not get contact details for ${contactId}, using fallback`);
                contact = { id: { _serialized: contactId }, pushname: 'Unknown' };
            }

            try {
                chat = await this.client.getChatById(contactId);
            } catch (chatError) {
                logger.warn(`Could not get chat details for ${contactId}, using fallback`);
                chat = { name: 'Unknown', isGroup: false, isMuted: false };
            }

            // Build contact info with safe property access
            return {
                id: contact.id?._serialized || contactId,
                name: contact.name || contact.pushname || 'Unknown',
                phone: contact.number || contactId.split('@')[0].replace(/\D/g, '') || null,
                isBlocked: contact.isBlocked || false,
                isWAContact: contact.isWAContact ?? true,
                profilePicUrl: null, // Skip profile pic to avoid errors
                chatName: chat.name || 'Unknown',
                isGroup: chat.isGroup || false,
                isMuted: chat.isMuted || false
            };
        } catch (error) {
            logger.warn('Error getting contact info, using minimal fallback:', error.message);
            // Return minimal valid contact info instead of null
            return {
                id: contactId,
                name: 'Unknown',
                phone: contactId.split('@')[0].replace(/\D/g, '') || null,
                isBlocked: false,
                isWAContact: true,
                profilePicUrl: null,
                chatName: 'Unknown',
                isGroup: false,
                isMuted: false
            };
        }
    }

    async downloadMedia(message) {
        try {
            if (!message.hasMedia) {
                logger.debug('Message has no media to download');
                return null;
            }

            const media = await message.downloadMedia();

            // Ensure media was successfully downloaded
            if (!media) {
                logger.warn('downloadMedia returned null or undefined');
                return null;
            }

            return {
                mimetype: media.mimetype || 'application/octet-stream',
                data: media.data || '',
                filename: media.filename || 'unknown'
            };
        } catch (error) {
            logger.error('Error downloading media:', error);
            return null;
        }
    }

    // Polling removed - message event handler is sufficient for real-time message processing
    // If you need polling in the future, uncomment and call this method in the 'ready' event

    async markAsRead(message) {
        try {
            const chat = await message.getChat();
            await chat.markUnread(false);
        } catch (error) {
            logger.error('Error marking message as read:', error);
        }
    }

    async destroy() {
        try {
            if (this.client) {
                await this.client.destroy();
                this.isReady = false;
                logger.info('WhatsApp client destroyed');
            }
        } catch (error) {
            logger.error('Error destroying WhatsApp client:', error);
        }
    }

    isClientReady() {
        return this.isReady;
    }
}

module.exports = WhatsAppService;