const express = require('express');
const QRCode = require('qrcode');
const open = require('open');
const logger = require('../utils/logger');

/**
 * Web Service for displaying QR code in browser
 * Provides a simple web interface for WhatsApp authentication
 */
class WebService {
    constructor() {
        this.app = express();
        this.server = null;
        this.port = process.env.WEB_PORT || 3000;
        this.qrCode = null;
        this.isAuthenticated = false;
        this.isReady = false;
        this.browserOpened = false; // Track if browser was already opened for QR

        this.setupRoutes();
    }

    setupRoutes() {
        // Serve static HTML page
        this.app.get('/', (req, res) => {
            const html = this.generateHTML();
            res.send(html);
        });

        // API endpoint to get QR code status
        this.app.get('/api/qr', (req, res) => {
            if (this.isReady) {
                res.json({
                    status: 'ready',
                    message: 'Bot is ready and listening for messages!'
                });
            } else if (this.isAuthenticated) {
                res.json({
                    status: 'authenticated',
                    message: 'WhatsApp is connected! Waiting for bot to be ready...'
                });
            } else if (this.qrCode) {
                res.json({
                    status: 'waiting',
                    qr: this.qrCode
                });
            } else {
                res.json({
                    status: 'loading',
                    message: 'Waiting for QR code...'
                });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok' });
        });
    }

    generateHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot - QR Code Authentication</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }

        .logo {
            font-size: 48px;
            margin-bottom: 20px;
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
        }

        #qr-container {
            background: #f5f5f5;
            border-radius: 15px;
            padding: 30px;
            margin: 30px 0;
            min-height: 320px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        #qr-code {
            max-width: 256px;
            width: 100%;
            height: auto;
        }

        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            font-weight: 500;
        }

        .status.loading {
            background: #fff3cd;
            color: #856404;
        }

        .status.waiting {
            background: #d1ecf1;
            color: #0c5460;
        }

        .status.authenticated {
            background: #d4edda;
            color: #155724;
        }

        .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .instructions {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
        }

        .instructions h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
        }

        .instructions ol {
            color: #666;
            padding-left: 20px;
            line-height: 1.8;
        }

        .instructions li {
            margin-bottom: 8px;
        }

        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }

        .footer {
            margin-top: 30px;
            color: #999;
            font-size: 14px;
        }

        .footer a {
            color: #667eea;
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">💬</div>
        <h1>WhatsApp Bot Authentication</h1>
        <p class="subtitle">Scan the QR code to connect your WhatsApp</p>

        <div id="qr-container">
            <div class="loader"></div>
            <p style="margin-top: 20px; color: #666;">Loading QR code...</p>
        </div>

        <div id="status" class="status loading">
            Initializing...
        </div>

        <div class="instructions">
            <h3>📱 How to connect:</h3>
            <ol>
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Go to <strong>Settings</strong> > <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Scan the QR code above</li>
            </ol>
        </div>

        <div class="footer">
            Powered by <a href="https://github.com" target="_blank">WhatsApp AI Bot</a>
        </div>
    </div>

    <script>
        let pollingInterval;
        let closeCountdown = null;

        async function checkQRStatus() {
            try {
                const response = await fetch('/api/qr');
                const data = await response.json();

                const qrContainer = document.getElementById('qr-container');
                const statusDiv = document.getElementById('status');

                if (data.status === 'ready') {
                    clearInterval(pollingInterval);
                    qrContainer.innerHTML = '<div class="success-icon">🤖</div><h2 style="color: #155724;">Bot is Ready!</h2><p style="color: #666; margin-top: 10px;">Already connected and listening for messages</p>';
                    statusDiv.className = 'status authenticated';
                    statusDiv.innerHTML = '✅ WhatsApp bot is ready! <span id="countdown">Closing in 5 seconds...</span>';

                    // Auto-close after 5 seconds
                    let countdown = 5;
                    closeCountdown = setInterval(() => {
                        countdown--;
                        const countdownEl = document.getElementById('countdown');
                        if (countdownEl) {
                            if (countdown > 0) {
                                countdownEl.textContent = 'Closing in ' + countdown + ' second' + (countdown > 1 ? 's' : '') + '...';
                            } else {
                                countdownEl.textContent = 'Closing now...';
                                clearInterval(closeCountdown);
                                window.close();
                                // Fallback if window.close() doesn't work
                                setTimeout(() => {
                                    countdownEl.textContent = 'You can close this window now.';
                                }, 500);
                            }
                        }
                    }, 1000);
                } else if (data.status === 'authenticated') {
                    clearInterval(pollingInterval);
                    qrContainer.innerHTML = '<div class="success-icon">✅</div><h2 style="color: #155724;">Connected!</h2><p style="color: #666; margin-top: 10px;">Loading bot...</p>';
                    statusDiv.className = 'status authenticated';
                    statusDiv.textContent = '✅ WhatsApp is connected! Waiting for bot to be ready...';
                } else if (data.status === 'waiting' && data.qr) {
                    qrContainer.innerHTML = '<img id="qr-code" src="' + data.qr + '" alt="QR Code" />';
                    statusDiv.className = 'status waiting';
                    statusDiv.textContent = '⏳ Waiting for you to scan the QR code...';
                } else {
                    qrContainer.innerHTML = '<div class="loader"></div><p style="margin-top: 20px; color: #666;">Loading QR code...</p>';
                    statusDiv.className = 'status loading';
                    statusDiv.textContent = 'Initializing WhatsApp client...';
                }
            } catch (error) {
                console.error('Error fetching QR status:', error);
            }
        }

        // Check status immediately
        checkQRStatus();

        // Poll every 2 seconds
        pollingInterval = setInterval(checkQRStatus, 2000);
    </script>
</body>
</html>
        `;
    }

    /**
     * Update QR code
     * @param {string} qr - QR code data from WhatsApp
     */
    async updateQR(qr) {
        try {
            // Generate QR code as data URL
            this.qrCode = await QRCode.toDataURL(qr, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            logger.info('QR code updated on web interface');
        } catch (error) {
            logger.error('Error generating QR code:', error);
        }
    }

    /**
     * Mark as authenticated
     */
    setAuthenticated() {
        this.isAuthenticated = true;
        this.qrCode = null;
        logger.info('WhatsApp authenticated - web interface updated');
    }

    /**
     * Mark as ready
     */
    setReady() {
        this.isReady = true;
        this.isAuthenticated = true;
        this.qrCode = null;
        logger.info('WhatsApp ready - web interface updated');
    }

    /**
     * Start the web server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    logger.info(`🌐 Web interface available at http://localhost:${this.port}`);

                    // Browser auto-open disabled - access manually at http://localhost:<WEB_PORT> if needed

                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.error(`Port ${this.port} is already in use`);
                    }
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Open browser automatically (only once per session)
     */
    async openBrowser() {
        // Don't open multiple times
        if (this.browserOpened) {
            logger.debug('Browser already opened, skipping');
            return;
        }

        try {
            this.browserOpened = true;
            await open(`http://localhost:${this.port}`);
            logger.info('Browser opened for QR code scanning');
        } catch (error) {
            logger.debug('Could not auto-open browser:', error.message);
        }
    }

    /**
     * Stop the web server
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.info('Web server stopped');
                    resolve();
                });
            });
        }
    }
}

module.exports = WebService;