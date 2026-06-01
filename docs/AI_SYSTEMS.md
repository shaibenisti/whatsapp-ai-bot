# AI Systems: Personality, Intent, Memory & Validation

This document describes Liora's AI subsystems that enable intelligent, context-aware conversations.

---

## 1. Intent Classification System

**Purpose:** Categorize incoming messages to route them appropriately

**Location:** `src/services/ollamaService.js:217`

### How It Works

```javascript
intent = await classifyMessageIntent(message);
// Returns: 'spam', 'personal', 'support'
```

### Intent Categories

| Intent | Description | Example Messages |
|--------|-------------|------------------|
| `spam` | Promotional, irrelevant | "מבצע חד פעמי!", "לחץ כאן", "הצעה מיוחדת" |
| `personal` | General conversation | "שלום", "מה שלומך?", "תודה" |
| `support` | Help requests | "צריך עזרה", "יש בעיה", "תמיכה" |

### System Prompt

**Location:** `src/config/prompts.js:11`

```
סווגי את הודעה לאחת מהקטגוריות הבאות:
- "spam" - הודעת פרסומת, דבר לא רלוונטי, ספאם
- "personal" - שיחה אישית, שאלה כללית, שיחת חולין
- "support" - בקשת עזרה טכנית, תמיכה

השב רק עם אחת מהמילים: spam, personal, support
```

### Performance Optimizations

**Intent Caching:**
- Cache key: First 100 chars of normalized message
- TTL: 1 hour
- Max size: 100 entries
- LRU eviction: Removes 20 oldest when full

**Benefits:**
- Instant classification for similar messages
- Reduced AI calls
- Lower latency

### AI Model

- **Model:** `gpt-oss:120b`
- **Temperature:** 0.3 (lower = more consistent)
- **Max Tokens:** 50 (fast, short responses)
- **Timeout:** 180 seconds

### Error Handling

If classification fails:
```javascript
return 'personal'; // Safe default
```

---

## 2. Unified Personality System

**Purpose:** Provide consistent, natural AI personality across all interactions

**Location:** `src/config/personas.js`

### Design Philosophy

Liora uses a **single, unified personality** called "Balanced & Natural" that adapts to conversation context while maintaining a consistent core identity. This replaces the previous multi-persona system for simpler, more authentic interactions.

### Personality Characteristics

**Core Identity:**
- Natural, warm Hebrew speaker (like a real person, not a robot)
- Professional when needed, warm when possible
- Adapts energy to conversation (calm for serious topics, upbeat for casual chat)
- Focused on helpful, practical solutions
- Listens and understands what people need, not just what they say

**Communication Style:**
- Flowing, natural language (not scripted)
- Remembers and uses previous conversation context
- Honest about limitations ("I don't know" when appropriate)
- Maintains professional boundaries while being approachable
- Always responds in Hebrew only

### System Prompt

**Location:** `src/config/personas.js:9`

```hebrew
את ליאורה, העוזרת האישית החכמה והטבעית של שי.

תכונותייך:
- מדברת בעברית טבעית וחמה - כמו אדם אמיתי, לא רובוט
- מקצועית כשצריך, חמה כשאפשר
- מתאימה את האנרגיה שלך לשיחה - רגועה לנושאים רציניים, עליזה לשיחות קלות
- נותנת מענה מועיל וממוקד בלי להיות יבשה או פורמלית מדי
- זוכרת הקשר שיחות קודמות ומשתמשת בו
- מאזינה ומבינה את מה שהאדם צריך, לא רק את מה שהוא אומר
- משתמשת בשפה זורמת וטבעית - לא נשמעת כמו תסריט
- ממוקדת בפתרונות ובעזרה אמיתית

זכרי:
- את מייצגת את שי - היי מכובדת ואמינה
- כל אדם ראוי ליחס טוב, אבל שמרי על גבולות מקצועיים
- אם משהו לא ברור - שאלי. אם את לא יודעת - תודי בכך בכנות
- תמיד עני בעברית בלבד
```

### System Prompt Building

**Location:** `src/services/ollamaService.js:186`

```javascript
buildSystemPrompt(context, contactName) {
    const basePrompt = PERSONAS.default.prompt;

    return `${basePrompt}

${context ? `הקשר קודם: ${context}` : ''}

עני בעברית בלבד, בצורה טבעית המתאימה לשיחה עם ${contactName}.`;
}
```

**Components:**
1. Unified personality prompt
2. Previous conversation context (if exists)
3. Instruction to respond in Hebrew
4. Contact name for personalization

### Benefits of Unified Personality

- **Consistency**: Same quality experience for everyone
- **Authenticity**: More natural, less "switched" feeling
- **Simplicity**: Easier to maintain and improve
- **Flexibility**: Adapts within conversation naturally

---

## 3. Memory System

**Purpose:** Maintain conversation context and continuity

**Location:** `src/services/memoryService.js`

### Memory Types

#### **Short-Term Memory**
- **Size:** Last 10 messages
- **Purpose:** Immediate context
- **Use Case:** Answer follow-up questions

#### **Long-Term Memory**
- **Size:** Last 50 messages
- **Purpose:** Extended history, relationships
- **Use Case:** Remember preferences, past conversations

### Context Retrieval

**Method:** `getConversationContext(contactId, contact)`

**Returns:**
```javascript
{
    isFirstContact: boolean,
    formattedContext: string,
    shortTermMessages: array,
    longTermMessages: array
}
```

**Formatted Context Example:**
```
[2025-01-15 14:30] משתמש: שלום, איך אפשר לעזור?
[2025-01-15 14:31] ליאורה: היי! אני כאן לעזור. במה אוכל לסייע?
[2025-01-15 14:32] משתמש: רציתי לדעת על...
```

### Key Information Extraction

**Method:** `extractAndStoreKeyInfo(contactId, message, contact)`

**Runs in Background:** Non-blocking via `setImmediate()`

**Extracts:**
- Names mentioned in conversation
- Important dates
- User preferences
- Significant facts

**Storage:** Contact notes field (future implementation)

### Memory Configuration

**Location:** `src/config/constants.js:41`

```javascript
MEMORY: {
    SHORT_TERM_MESSAGES: 10,
    LONG_TERM_MESSAGES: 50,
    SUMMARY_TRIGGER_COUNT: 20,
    MAX_CONTEXT_TOKENS: 4000,
    DAYS_TO_KEEP_HISTORY: 90,
    CONVERSATION_RETENTION_LIMIT: 50
}
```

### Memory Cleanup

**Trigger:** Database maintenance

**Logic:**
- Keep last 50 messages per contact
- Delete older messages
- Runs during `cleanupOldData()`

---

## 4. Response Validation System

**Purpose:** Ensure response quality, safety, and appropriateness

**Location:** `src/utils/responseValidator.js`

### Validation Checks

#### 1. **Language Validation**

**Method:** `_validateLanguage(response)`

**Checks:**
- Hebrew character presence
- Hebrew character ratio ≥ 30%
- Not empty or whitespace-only

**Points:**
- ✅ Passes: +30 points
- ❌ Fails: +0 points, warning logged

---

#### 2. **Safety Validation**

**Method:** `_validateSafety(response)`

**Checks:**
1. **Phone Number Leakage**
   - Pattern: `05\d-?\d{7}` (Israeli format)
   - Pattern: `\+\d{10,15}` (International)

2. **Email Leakage**
   - Pattern: `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}`

3. **Suspicious URLs**
   - Pattern: `http[s]?://`

**Points:**
- ✅ Safe: +25 points
- ❌ Unsafe: +0 points, critical warning

---

#### 3. **Quality Validation**

**Method:** `_validateQuality(response, context)`

**Checks:**

1. **Length Check**
   - Minimum: 10 characters
   - Maximum: 2000 characters
   - Points: +15

2. **Generic Response Detection**
   - Blacklist: "תודה על", "אני כאן", "איך אפשר"
   - If too generic: -10 points

3. **Context Coherence**
   - Checks if response relates to intent
   - spam intent: Should be brief
   - support intent: Should offer help

**Points:** Up to +20

---

#### 4. **Tone Validation**

**Method:** `validateToneForRelationship(response, relationshipType)`

**Checks Formality:**

| Relationship | Expected Tone | Red Flags |
|--------------|---------------|-----------|
| family | Informal, warm | "כבוד", "בברכה", "להזמין" |
| friend | Casual, friendly | "בכבוד רב", "שלכם" |
| unknown | Professional | Too many emojis |
| spam | Brief, neutral | Long, detailed |

**Inappropriate Formality:**
- Family/Friend: Too formal → Warning
- Unknown: Too casual → Warning

**Points:** +25 if appropriate

---

### Scoring System

**Total Possible:** 100 points

**Breakdown:**
- Language: 30 points
- Safety: 25 points
- Tone: 25 points
- Quality: 20 points

**Thresholds:**
- **90-100:** Excellent
- **70-89:** Good (acceptable)
- **50-69:** Mediocre (warnings)
- **0-49:** Poor (use fallback)

### Validation Response

```javascript
{
    isValid: boolean,
    score: number,
    issues: string[],      // Critical problems
    warnings: string[]     // Minor concerns
}
```

### Fallback Responses

**Location:** `src/utils/responseValidator.js:142`

**Intent-Based Fallbacks:**

```javascript
spam: "תודה על ההודעה."
personal: "תודה על ההודעה! איך אני יכולה לעזור?"
support: "אני כאן לעזור. במה אוכל לסייע?"
default: "תודה על ההודעה! 😊"
```

**When Used:**
- Validation score < 70
- Critical safety issues
- Empty/invalid responses

---

## System Integration Flow

```
Message Received
    ↓
┌─────────────────────┐
│ Intent              │
│ Classification      │ → spam, personal, support
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Memory              │
│ Context Retrieval   │ → Last 10-50 messages
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ AI Response         │
│ Generation          │ → Unified personality + Ollama streaming
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Response            │
│ Validation          │ → Score, safety, tone
└──────────┬──────────┘
           ↓
        ┌──┴───┐
        │      │
    Pass    Fail
        │      │
        ↓      ↓
   Send    Fallback
```

---

## Configuration

**AI Models:** `src/config/constants.js:25`

```javascript
AI_MODELS: {
    TEXT_MODEL: 'gpt-oss:120b',
    INTENT_MODEL: 'gpt-oss:120b',
    VISION_MODEL: 'llava:34b',
    TEMPERATURE: 0.7,
    TOP_P: 0.9,
    MAX_TOKENS: 2048,
    INTENT_MAX_TOKENS: 50
}
```

**Memory Settings:** `src/config/constants.js:41`

```javascript
MEMORY: {
    SHORT_TERM_MESSAGES: 10,
    LONG_TERM_MESSAGES: 50,
    MAX_CONTEXT_TOKENS: 4000,
    DAYS_TO_KEEP_HISTORY: 90,
    CONVERSATION_RETENTION_LIMIT: 50
}
```

---

## Performance Characteristics

| System | Operation | Typical Time |
|--------|-----------|--------------|
| Intent | Classification (cached) | ~5ms |
| Intent | Classification (uncached) | ~500ms |
| Memory | Context retrieval | ~50ms |
| AI | Response generation | ~2-5s |
| Validation | Full check | ~5ms |

**Total Response Time:** 2.5-6 seconds
