const logger = require('./logger');

/**
 * Response Quality Validator
 * Ensures Liora's responses meet quality and safety standards
 */
class ResponseValidator {
    constructor() {
        // Problematic patterns that should never appear in responses
        this.forbiddenPatterns = [
            // Inappropriate content
            /\b(fuck|shit|damn|hell|bitch|ass)\b/i,
            /\b(זין|כוס|חרא|לעזאזל)\b/i,

            // Personal information leaks (phone/email not from config)
            /\b\d{3}-\d{3}-\d{4}\b/,  // US phone format
            /\b05\d-?\d{7}\b/,        // Israeli mobile (except configured)

            // Suspicious instructions
            /install.*malware/i,
            /delete.*system/i,
            /format.*drive/i,

            // Repetitive patterns (sign of AI glitch)
            /(.{20,})\1{3,}/,  // Same 20+ chars repeated 3+ times

            // Encoding errors
            /�+/,  // Replacement characters
            /[\x00-\x08\x0B-\x0C\x0E-\x1F]/,  // Control characters
        ];

        // Warning patterns (log but don't block)
        this.warningPatterns = [
            // Very long responses (might be rambling)
            { pattern: /.{1000,}/, name: 'very_long_response' },

            // Too many emojis
            { pattern: /([\u{1F300}-\u{1F9FF}].*){10,}/u, name: 'emoji_spam' },

            // Repeated punctuation
            { pattern: /[!?.]{5,}/, name: 'punctuation_spam' },

            // Potential hallucination
            { pattern: /as an ai language model/i, name: 'ai_leak' },
            { pattern: /i (don't|can't) have (access|information)/i, name: 'limitation_leak' },
        ];

        // Quality checks
        this.qualityChecks = {
            minLength: 5,        // Too short = lazy response
            maxLength: 2000,     // Too long = rambling
            maxLines: 50,        // Don't send wall of text
            hebrewRatio: 0.3,    // Should have substantial Hebrew (for Hebrew responses)
        };

        // Known good contact numbers (won't flag as leak) - loaded from env
        const ownerPhone = process.env.OWNER_PHONE || '';
        this.allowedPhoneNumbers = ownerPhone ? [
            ownerPhone,
            ownerPhone.replace(/-/g, '') // Also allow without dashes
        ] : [];
    }

    /**
     * Validate response before sending
     * @param {string} response - Generated response
     * @param {Object} context - Context info (intent, contact, etc)
     * @returns {Object} { isValid, issues, warnings, sanitized }
     */
    validate(response, context = {}) {
        const issues = [];
        const warnings = [];
        let sanitized = response;

        // Check if response exists
        if (!response || typeof response !== 'string') {
            return {
                isValid: false,
                issues: ['Response is null or not a string'],
                warnings: [],
                sanitized: null
            };
        }

        // Trim whitespace
        sanitized = sanitized.trim();

        // 1. Check forbidden patterns (BLOCKING)
        for (const pattern of this.forbiddenPatterns) {
            if (pattern.test(sanitized)) {
                // Special handling for phone numbers
                if (pattern.source.includes('05')) {
                    // Check if it's an allowed number
                    const phoneMatch = sanitized.match(/05\d-?\d{7}/);
                    if (phoneMatch && this.allowedPhoneNumbers.some(allowed =>
                        phoneMatch[0].replace(/-/g, '') === allowed.replace(/-/g, '')
                    )) {
                        continue; // Skip this - it's allowed
                    }
                }

                issues.push({
                    type: 'forbidden_pattern',
                    pattern: pattern.source,
                    severity: 'critical'
                });
            }
        }

        // 2. Check warning patterns (NON-BLOCKING)
        for (const { pattern, name } of this.warningPatterns) {
            if (pattern.test(sanitized)) {
                warnings.push({
                    type: 'warning_pattern',
                    name,
                    severity: 'warning'
                });
            }
        }

        // 3. Quality checks
        // Check if response is essentially empty (only whitespace/special chars)
        const contentOnly = sanitized.replace(/[\s\n]/g, '');
        if (contentOnly.length === 0) {
            issues.push({
                type: 'empty_response',
                severity: 'critical'
            });
        } else if (sanitized.length < this.qualityChecks.minLength) {
            issues.push({
                type: 'too_short',
                severity: 'high',
                actual: sanitized.length,
                expected: this.qualityChecks.minLength
            });
        }

        if (sanitized.length > this.qualityChecks.maxLength) {
            warnings.push({
                type: 'too_long',
                severity: 'warning',
                actual: sanitized.length,
                limit: this.qualityChecks.maxLength
            });
        }

        const lineCount = sanitized.split('\n').length;
        if (lineCount > this.qualityChecks.maxLines) {
            warnings.push({
                type: 'too_many_lines',
                severity: 'warning',
                actual: lineCount,
                limit: this.qualityChecks.maxLines
            });
        }

        // 4. Hebrew content check (for Hebrew responses)
        if (context.expectedLanguage === 'hebrew') {
            const hebrewChars = (sanitized.match(/[\u0590-\u05FF]/g) || []).length;
            const totalChars = sanitized.replace(/\s/g, '').length;
            const hebrewRatio = totalChars > 0 ? hebrewChars / totalChars : 0;

            if (hebrewRatio < this.qualityChecks.hebrewRatio) {
                warnings.push({
                    type: 'insufficient_hebrew',
                    severity: 'warning',
                    actual: hebrewRatio.toFixed(2),
                    expected: this.qualityChecks.hebrewRatio
                });
            }
        }

        // Empty check already done above in quality checks

        // 6. Check for response duplication (same message repeated)
        const lines = sanitized.split('\n').filter(l => l.trim());
        const uniqueLines = new Set(lines);
        if (lines.length > 5 && uniqueLines.size < lines.length * 0.5) {
            warnings.push({
                type: 'repetitive_content',
                severity: 'warning',
                uniqueRatio: (uniqueLines.size / lines.length).toFixed(2)
            });
        }

        // Determine if valid
        const isValid = issues.filter(i => i.severity === 'critical').length === 0;

        // Log issues and warnings
        if (issues.length > 0) {
            logger.warn('Response validation issues:', {
                issues,
                response: sanitized.substring(0, 100),
                context
            });
        }

        if (warnings.length > 0) {
            logger.debug('Response validation warnings:', {
                warnings,
                response: sanitized.substring(0, 100)
            });
        }

        return {
            isValid,
            issues,
            warnings,
            sanitized,
            score: this.calculateQualityScore(issues, warnings)
        };
    }

    /**
     * Calculate quality score (0-100)
     * @private
     */
    calculateQualityScore(issues, warnings) {
        let score = 100;

        // Deduct for issues
        for (const issue of issues) {
            if (issue.severity === 'critical') score -= 50;
            else if (issue.severity === 'high') score -= 20;
            else if (issue.severity === 'medium') score -= 10;
        }

        // Deduct for warnings
        for (const warning of warnings) {
            score -= 5;
        }

        return Math.max(0, score);
    }

    /**
     * Get fallback response when validation fails
     */
    getFallbackResponse(intent = 'general') {
        const ownerName = process.env.OWNER_NAME || 'הבעלים';

        const fallbacks = {
            support: 'אני כאן לעזור! תוכל לפרט מה אתה צריך ואני אעשה כמיטב יכולתי לסייע.',
            personal: 'תודה על ההודעה! 😊',
            general: `תודה על הפנייה! ${ownerName} יחזור אליך בהקדם האפשרי. 📞`
        };

        return fallbacks[intent] || fallbacks.general;
    }

    /**
     * Check if response is appropriate for contact relationship
     */
    validateToneForRelationship(response, relationshipType) {
        const toneChecks = {
            family: {
                shouldHave: ['❤️', '😊', '🤗'],
                shouldNotHave: ['פורמלי מדי', 'רשמי'],
                formality: 'low'
            },
            friend: {
                shouldHave: ['😊', 'איך קורה'],
                shouldNotHave: ['רציני מדי'],
                formality: 'medium'
            },
            business: {
                shouldHave: ['אשמח', 'נשמח', 'מקצועי'],
                shouldNotHave: ['יא מן', 'בנאדם', 'חבר שלי'],
                formality: 'high'
            }
        };

        const checks = toneChecks[relationshipType];
        if (!checks) return { appropriate: true };

        // Simplified tone checking
        const inappropriate = checks.shouldNotHave?.some(phrase =>
            response.toLowerCase().includes(phrase.toLowerCase())
        );

        return {
            appropriate: !inappropriate,
            relationshipType,
            concerns: inappropriate ? ['inappropriate_tone'] : []
        };
    }
}

module.exports = ResponseValidator;