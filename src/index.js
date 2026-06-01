// Load environment variables from .env file
require('dotenv').config();

const WhatsAppService = require('./services/whatsappService');
const OllamaService = require('./services/ollamaService');
const ContactService = require('./services/contactService');
const MessageProcessor = require('./services/messageProcessor');
const MessageTracker = require('./utils/messageTracker');
const WebService = require('./services/webService');
const logger = require('./utils/logger');
const { TIME } = require('./config/constants');

class LioraBot {
    constructor() {
        this.whatsappService = new WhatsAppService();
        this.ollamaService = new OllamaService();
        this.contactService = new ContactService();
        this.messageProcessor = new MessageProcessor(this.ollamaService, this.contactService);
        this.messageProcessor.setWhatsAppService(this.whatsappService);
        this.messageTracker = new MessageTracker();
        this.webService = new WebService();
        this.startupTime = null; // Track when bot becomes ready
        this.cleanupInterval = null; // Handle for the periodic DB cleanup timer

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.whatsappService.on('ready', () => {
            this.startupTime = Math.floor(Date.now() / 1000); // Store startup timestamp in seconds
            logger.info('LIORA bot is ready! 🤖');
            logger.info(`Startup time: ${new Date(this.startupTime * 1000).toLocaleString('he-IL')} - Only processing new messages`);

            // Update web interface
            this.webService.setReady();
        });

        this.whatsappService.on('authenticated', () => {
            // Update web interface so the QR page reflects the connected state
            this.webService.setAuthenticated();
        });

        this.whatsappService.on('message', async (message) => {
            try {
                // Wait for bot to be fully ready before processing messages
                if (!this.startupTime) {
                    logger.debug(`Bot not ready yet, skipping message from ${message.from}`);
                    return;
                }

                // Only process messages received after bot startup (ignore backlog)
                if (message.timestamp < this.startupTime) {
                    logger.debug(`Skipping old message from ${message.from} (received before startup)`);
                    return;
                }

                // Check if we should process this message (prevents duplicates and rapid messages)
                // If tracker fails, fall back to processing all messages (better than breaking)
                let shouldProcess = true;
                try {
                    shouldProcess = this.messageTracker.shouldProcessMessage(message);
                } catch (trackerError) {
                    logger.warn('MessageTracker failed, processing message anyway:', trackerError.message);
                    shouldProcess = true; // Fallback: process the message
                }

                if (!shouldProcess) {
                    return; // Skip this message
                }

                // Process message normally
                // Get contact info once and pass it along to avoid duplicate calls
                const contactInfo = await this.whatsappService.getContactInfo(message.from);
                await this.messageProcessor.processMessage(message, contactInfo);
            } catch (error) {
                logger.error('Error processing message:', error);
            }
        });

        this.whatsappService.on('qr', (qr) => {
            logger.info('QR Code received - opening browser for authentication');

            // Update web interface with QR code
            this.webService.updateQR(qr);

            // Open browser automatically when QR code needs to be scanned
            this.webService.openBrowser();
        });

        this.whatsappService.on('disconnected', (reason) => {
            logger.warn('WhatsApp client disconnected:', reason);
        });
    }

    async start() {
        try {
            logger.info('🚀 Starting LIORA WhatsApp Bot...');

            // Start web interface first
            await this.webService.start();

            // Initialize services
            await this.contactService.initialize();

            // Verify Ollama is reachable and the model is available (non-fatal)
            await this.checkOllama();

            // Prune old conversation history now and daily, so the DB doesn't grow forever
            this.contactService.cleanupOldData().catch(err => logger.warn('Initial cleanup failed:', err.message));
            this.cleanupInterval = setInterval(() => {
                this.contactService.cleanupOldData().catch(err => logger.warn('Scheduled cleanup failed:', err.message));
            }, TIME.MS_IN_DAY);

            await this.whatsappService.initialize();

            logger.info('Bot services initialized - waiting for WhatsApp authentication...');
        } catch (error) {
            logger.error('❌ Failed to start LIORA bot:', error);
            process.exit(1);
        }
    }

    /**
     * Verify the Ollama backend is reachable and the configured text model exists.
     * Non-fatal: logs a clear warning so startup/connection issues are obvious.
     */
    async checkOllama() {
        try {
            const healthy = await this.ollamaService.healthCheck();
            if (!healthy) {
                logger.warn(`⚠️  Ollama is not reachable at ${this.ollamaService.baseUrl} - the bot will start, but cannot generate replies until Ollama is running.`);
                return;
            }

            const model = this.ollamaService.textModel;
            const available = await this.ollamaService.isModelAvailable(model);
            if (!available) {
                logger.warn(`⚠️  Ollama is up but model "${model}" was not found. Run: ollama pull ${model}`);
            } else {
                logger.info(`✅ Ollama is reachable and model "${model}" is available`);
            }
        } catch (error) {
            logger.warn('Ollama health check failed (non-fatal):', error.message);
        }
    }

    async stop() {
        try {
            logger.info('🛑 Stopping LIORA bot...');

            // Stop the periodic cleanup timer
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }

            // Stop web server
            if (this.webService) {
                await this.webService.stop();
            }

            await this.whatsappService.destroy();

            // Clean up message tracker
            if (this.messageTracker) {
                this.messageTracker.destroy();
            }

            // Close the database connection
            if (this.contactService) {
                await this.contactService.close();
            }

            logger.info('✅ LIORA bot stopped successfully');
        } catch (error) {
            logger.error('Error stopping bot:', error);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    if (global.lioraBot) {
        await global.lioraBot.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    if (global.lioraBot) {
        await global.lioraBot.stop();
    }
    process.exit(0);
});

// Start the bot
const bot = new LioraBot();
global.lioraBot = bot;
bot.start().catch(error => {
    logger.error('Failed to start LIORA bot:', error);
    process.exit(1);
});