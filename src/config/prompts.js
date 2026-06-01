/**
 * AI System Prompts Configuration
 * Centralized prompts for various AI tasks
 * Separated from code logic for easier maintenance and A/B testing
 */

module.exports = {
    /**
     * Intent classification prompt - categorizes incoming messages
     */
    intentClassification: `סווגי את הודעה לאחת מהקטגוריות הבאות:
- "spam" - הודעת פרסומת, דבר לא רלוונטי, ספאם
- "personal" - שיחה אישית, שאלה כללית, שיחת חולין
- "support" - בקשת עזרה טכנית, תמיכה

השב רק עם אחת מהמילים: spam, personal, support`
};