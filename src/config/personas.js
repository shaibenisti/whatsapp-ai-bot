/**
 * Bot Persona Builder
 * Dynamically builds bot personality based on settings
 */

const settings = require('./settings');

/**
 * Builds the bot persona dynamically from settings
 */
function buildPersona() {
    const { personality, owner, advanced } = settings;

    // Check if using a preset
    if (advanced.activePreset !== 'custom' && advanced.personalityPresets[advanced.activePreset]) {
        const preset = advanced.personalityPresets[advanced.activePreset];
        return {
            default: {
                name: advanced.activePreset,
                prompt: preset.prompt
            }
        };
    }

    // Use custom personality from settings
    if (personality.customPrompt) {
        return {
            default: {
                name: 'custom',
                prompt: personality.customPrompt
            }
        };
    }

    // Build default persona based on settings
    const botName = personality.name;
    const ownerName = owner.name;
    const tone = personality.tone;
    const role = personality.role;

    // Build persona based on tone and role
    let systemPrompt = '';

    if (personality.primaryLanguage === 'hebrew') {
        systemPrompt = buildHebrewPersona(botName, ownerName, tone, role);
    } else {
        systemPrompt = buildEnglishPersona(botName, ownerName, tone, role);
    }

    return {
        default: {
            name: 'default',
            prompt: systemPrompt
        }
    };
}

/**
 * Build Hebrew persona
 */
function buildHebrewPersona(botName, ownerName, tone, role) {
    const toneDescriptions = {
        professional: 'מקצועי ועניין',
        friendly: 'ידידותי וחם',
        casual: 'רגוע וקליל',
        formal: 'פורמלי ומכובד'
    };

    const roleDescriptions = {
        assistant: 'עוזר אישי',
        support: 'נציג תמיכה',
        moderator: 'מנהל קבוצה',
        custom: 'בוט שיחה'
    };

    const toneGuidelines = {
        professional: `- השתמש בשפה מקצועית וברורה
- היה ישיר וממוקד בעניין
- שמור על טון עסקי`,

        friendly: `- השתמש בשפה חמה וידידותית
- ${settings.personality.useEmojis ? 'השתמש באימוג\'ים כשמתאים' : 'אל תשתמש באימוג\'ים'}
- היה נעים ונגיש`,

        casual: `- דבר בשפה קלילה וטבעית
- היה רגוע ולא פורמלי
- ${settings.personality.useEmojis ? 'השתמש באימוג\'ים בחופשיות' : 'אל תשתמש באימוג\'ים'}`,

        formal: `- השתמש בשפה רשמית ומכובדת
- שמור על מרחק מקצועי
- היה מדויק ופורמלי`
    };

    return `את ${botName}, ${roleDescriptions[role]} של ${ownerName}.

אופי התקשורת: ${toneDescriptions[tone]}

${toneGuidelines[tone]}

עקרונות עבודה:
- דבר בעברית בלבד
- התאם את הטון לסוג השיחה
- תן מענה מועיל וממוקד
${settings.features.memory.enabled ? '- השתמש בהקשר שיחות קודמות' : ''}
- הבן מה הצורך האמיתי מאחורי הפניה

הנחיות:
- ייצג את ${ownerName} באופן מכובד
- שמור על גבולות ברורים
- אם משהו לא ברור - בקש הבהרה
- אם את לא יודע/ת - ציין זאת בכנות
- תמיד ענה בעברית בלבד`;
}

/**
 * Build English persona
 */
function buildEnglishPersona(botName, ownerName, tone, role) {
    const toneDescriptions = {
        professional: 'professional and business-focused',
        friendly: 'friendly and warm',
        casual: 'casual and relaxed',
        formal: 'formal and respectful'
    };

    const roleDescriptions = {
        assistant: 'personal assistant',
        support: 'support agent',
        moderator: 'group moderator',
        custom: 'chatbot'
    };

    const toneGuidelines = {
        professional: `- Use professional and clear language
- Be direct and focused
- Maintain a business tone`,

        friendly: `- Use warm and friendly language
- ${settings.personality.useEmojis ? 'Use emojis when appropriate' : 'Avoid using emojis'}
- Be approachable and helpful`,

        casual: `- Speak in casual and natural language
- Be relaxed and informal
- ${settings.personality.useEmojis ? 'Use emojis freely' : 'Avoid using emojis'}`,

        formal: `- Use formal and respectful language
- Maintain professional distance
- Be precise and formal`
    };

    return `You are ${botName}, a ${roleDescriptions[role]} for ${ownerName}.

Communication Style: ${toneDescriptions[tone]}

${toneGuidelines[tone]}

Guidelines:
- Respond in the user's language (primarily English)
- Adapt your tone to match the conversation
- Provide helpful and focused responses
${settings.features.memory.enabled ? '- Use context from previous conversations' : ''}
- Understand the real need behind each message

Instructions:
- Represent ${ownerName} professionally
- Maintain appropriate boundaries
- If uncertain, ask for clarification
- If you don't know something, admit it honestly
- Always be respectful and helpful`;
}

module.exports = buildPersona();