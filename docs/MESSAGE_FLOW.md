# Message Processing Flow

This document describes how Liora processes incoming WhatsApp messages from receipt to response.

---

## High-Level Flow

```
1. Message Received (WhatsApp)
2. Deduplication Check
3. Weekend/Hours Check
4. Message Type Routing
5. Intent Classification
6. Memory Context Retrieval
7. AI Response Generation (with unified personality)
8. Response Validation
9. Send Response
10. Log Conversation
```

---

## Detailed Step-by-Step

### Step 1: Message Reception

**Location:** `src/index.js:30` - Event listener

```javascript
whatsappService.on('message', async (message) => { ... })
```

**What Happens:**
- WhatsApp client receives message
- Fires 'message' event
- Message object contains:
  - `from`: Sender ID
  - `body`: Message text
  - `type`: chat, image, document, audio, etc.
  - `id`: Unique message identifier
  - `timestamp`: When sent

---

### Step 2: Deduplication Check

**Location:** `src/index.js:36` - MessageTracker

**Purpose:** Prevents processing duplicate or rapid-fire messages

**Logic:**
```javascript
shouldProcess = messageTracker.shouldProcessMessage(message)
```

**Criteria:**
- Not processed in last 5 minutes
- Not a duplicate message ID
- Sliding window cleanup

**Outcome:**
- ✅ Process → Continue
- ❌ Skip → Return early

---

### Step 3: Weekend/Hours Check

**Location:** `src/index.js:46` - BusinessHours

**Purpose:** Silent mode Friday-Saturday

**Logic:**
```javascript
if (!businessHours.isActiveHour()) {
    // Send personalized auto-response
    return;
}
```

**Weekend Response:**
- Gets contact info
- Generates personalized message based on relationship
- Sends auto-response
- Stops processing

**Example:**
- Family: "היי [name]! השבת זה זמן משפחה 💝"
- Friend: "היי [name]! אני במצב שבת עד מוצ״ש ✨"
- Unknown: "שלום! אני במצב שבת ולא זמינה עד מוצאי שבת 🌙"

---

### Step 4: Message Type Routing

**Location:** `src/services/messageProcessor.js:62`

**Supported Types:**

| Type | Handler | Description |
|------|---------|-------------|
| `chat` | `processTextMessage()` | Text messages |
| `image` | `processImageMessage()` | Images with optional captions |
| `document` | `processDocumentMessage()` | PDF, DOCX, etc. |
| `ptt` / `audio` | Ignored | Voice messages (disabled) |
| `sticker` | Basic response | Quick friendly reply |
| `location` | Basic response | Thanks + offer help |
| `e2e_notification` | Ignored | System messages |
| `revoked` | Ignored | Deleted messages |

---

### Step 5: Text Message Processing

**Location:** `src/services/messageProcessor.js:205`

#### 5a. Parallel Operations (Performance Optimization)

```javascript
const [intent, memoryContext] = await Promise.all([
    ollama.classifyMessageIntent(messageText),
    memory.getConversationContext(contactId, contact)
]);
```

**Intent Classification:**
- Uses Ollama intent model
- Fast classification with caching
- Returns: `spam`, `personal`, `support`

**Memory Context Retrieval:**
- Short-term: Last 10 messages
- Long-term: Last 50 messages
- Formatted conversation history
- First contact detection

#### 5b. Spam Handling

**Location:** `src/services/messageProcessor.js:219`

**Logic:**
1. If intent = spam AND not already marked:
   - Mark as spam
   - Send warning: "ההודעה שלך נראית כספאם"

2. If already marked spam:
   - Check for appeal ("לא ספאם", "טעות")
   - If appealing → Remove spam status
   - If not → Ignore silently

#### 5c. Background Information Extraction

**Location:** `src/services/messageProcessor.js:243`

```javascript
setImmediate(() => {
    memory.extractAndStoreKeyInfo(contactId, messageText, contact)
});
```

**Non-Blocking:** Runs in background, doesn't delay response

**Extracts:**
- Names mentioned
- Important dates
- Preferences
- Key facts

---

### Step 6: AI Response Generation

**Location:** `src/services/messageProcessor.js:248`

```javascript
response = await ollama.generateHebrewResponse(
    messageText,
    contextString,
    contactName
);
```

**Inputs:**
- Current message text
- Conversation context (formatted history)
- Contact name for personalization

**AI Processing:**
1. Builds system prompt with unified personality
2. Adds conversation context
3. Includes contact name for natural address
4. Streams response from Ollama
5. Returns Hebrew response

**Personality:**
- Uses single "Balanced & Natural" personality for all conversations
- Adapts energy naturally based on conversation context
- Consistent, authentic communication across all contact types

**Streaming Benefits:**
- Better perceived performance
- Partial response processing possible
- Lower latency feel

---

### Step 7: Response Validation

**Location:** `src/services/messageProcessor.js:128`

```javascript
const validation = validator.validate(response, {
    expectedLanguage: 'hebrew',
    intent: intent,
    contactRelationship: contact.relationship_type
});
```

**Validation Checks:**

1. **Language Detection**
   - Must be primarily Hebrew
   - Hebrew character ratio > 30%

2. **Safety Checks**
   - No phone numbers leaked
   - No email addresses leaked
   - No suspicious URLs

3. **Quality Checks**
   - Minimum length (10 chars)
   - Maximum length (2000 chars)
   - Not generic/template response
   - Coherent and contextual

4. **Tone Appropriateness**
   - Matches relationship type
   - Not too formal/informal
   - Appropriate emoji usage

**Scoring:** 0-100 points

**Outcome:**
- ✅ Score ≥ 70 → Send response
- ❌ Score < 70 → Use fallback response

**Fallback Responses:**
```
spam: "תודה על ההודעה."
personal: "תודה על ההודעה! איך אני יכולה לעזור?"
support: "אני כאן לעזור. במה אוכל לסייע?"
default: "תודה על ההודעה! 😊"
```

---

### Step 8: Send Response

**Location:** `src/services/messageProcessor.js:160`

```javascript
await whatsappService.sendMessage(contactId, response);
```

**Logging:**
```
🤖 Sending response to [contactId] [score: 85/100]: [preview...]
✅ Responded to [contactId] (chat)
```

---

### Step 9: Conversation Logging

**Location:** `src/services/messageProcessor.js:167`

**Two Log Entries:**

1. **User's Message:**
```javascript
await contacts.logConversation(
    contactId,
    messageId,
    messageContent,
    messageType,
    true,  // isFromContact
    intent,
    response
);
```

2. **Bot's Response:**
```javascript
await contacts.logConversation(
    contactId,
    null,  // no messageId for bot
    response,
    'chat',
    false,  // not from contact
    null,
    null
);
```

**Database Storage:**
- Both messages stored in `conversations` table
- Indexed by contact_id and timestamp
- Used for future context retrieval
- Cleaned up after 50 messages per contact

---

## Special Message Types

### Image Processing

**Location:** `src/services/messageProcessor.js:319`

**Flow:**
1. Download image via WhatsAppService
2. Extract image as base64
3. Check for caption text
4. Analyze with vision model (llava:34b)
5. Generate contextual response
6. Send response

**Example Prompt:**
```
"המשתמש שלח תמונה עם הכיתוב: 'מה דעתך על זה?'"
"תאר את התמונה ותענה על השאלה בצורה טבעית וחמה."
```

### Document Processing

**Location:** `src/services/messageProcessor.js:369`

**Flow:**
1. Download document
2. Get filename
3. Acknowledge receipt
4. Offer help

**Response Example:**
```
"תודה על המסמך (filename.pdf)! איך אני יכולה לעזור לך?"
```

---

## Performance Optimizations

1. **Parallel AI Calls:**
   - Intent classification + Memory retrieval run simultaneously
   - Reduces response time by ~30%

2. **Intent Caching:**
   - Similar messages cached for 1 hour
   - Prevents redundant classifications

3. **Background Processing:**
   - Key info extraction doesn't block response
   - Runs via `setImmediate()`

4. **Streaming Responses:**
   - Ollama streaming enabled
   - Better perceived performance

5. **Database Indexes:**
   - Optimized queries for conversation history
   - Fast lookups by contact and timestamp

---

## Error Handling

**Graceful Degradation:**

1. Tracker fails → Process message anyway
2. Memory retrieval fails → Continue with empty context
3. Intent classification fails → Default to 'personal'
4. Validation fails → Use fallback response
5. Send fails → Log error, send generic error message

**Error Message to User:**
```
"סליחה, נתקלתי בבעיה טכנית. אנסה שוב בעוד מעט. 😊"
```

---

## Message Flow Diagram

```
┌─────────────────────┐
│  WhatsApp Message   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  MessageTracker     │ → Duplicate? → Skip
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  BusinessHours      │ → Weekend? → Auto-response
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Type Router        │
└──────────┬──────────┘
           ↓
    ┌──────┴──────┐
    │             │
  [Text]      [Image/Doc]
    │             │
    ↓             ↓
┌────────────┐  ┌──────────────┐
│ Intent +   │  │ Vision Model │
│ Memory     │  │ Analysis     │
└─────┬──────┘  └──────┬───────┘
      │                │
      │                │
      └────────┬───────┘
               ↓
┌─────────────────────┐
│  AI Generation      │
│  (Unified          │
│   Personality)     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Validation         │ → Fail? → Fallback
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Send Response      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Log Conversation   │
└─────────────────────┘
```
