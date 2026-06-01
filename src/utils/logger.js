const winston = require('winston');
const path = require('path');
const { FILE_SIZE } = require('../config/constants');

const logDir = path.join(__dirname, '../../logs');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'liora-bot' },
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: FILE_SIZE.LOG_MAX_SIZE,
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: FILE_SIZE.LOG_MAX_SIZE,
            maxFiles: FILE_SIZE.MAX_LOG_FILES
        })
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, stack }) => {
                const ts = new Date().toLocaleTimeString('he-IL');
                if (stack) {
                    return `${ts} [${level}]: ${message}\n${stack}`;
                }
                return `${ts} [${level}]: ${message}`;
            })
        )
    }));
}

module.exports = logger;