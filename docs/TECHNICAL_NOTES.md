# Technical Implementation Notes

Technical details, database schema, configuration, and deployment notes for Liora v0.1.

---

## Database Schema

**Engine:** SQLite3
**Location:** `database/contacts.db`

### Table: contacts

```sql
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,              -- WhatsApp contact ID
    name TEXT NOT NULL CHECK(length(name) > 0),
    phone TEXT CHECK(phone IS NULL OR length(phone) >= 10),
    relationship_type TEXT DEFAULT 'unknown'
        CHECK(relationship_type IN ('family', 'friend', 'unknown', 'spam')),
    is_spam BOOLEAN DEFAULT 0 CHECK(is_spam IN (0, 1)),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
```sql
CREATE INDEX idx_contacts_relationship ON contacts(relationship_type);
```

**Validation:**
- Name cannot be empty (CHECK constraint)
- Phone must be ≥10 digits if provided
- relationship_type limited to 4 values
- is_spam boolean (0 or 1)

---

### Table: conversations

```sql
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
);
```

**Indexes:**
```sql
CREATE INDEX idx_conversations_contact_timestamp
    ON conversations(contact_id, timestamp DESC);

CREATE INDEX idx_conversations_timestamp
    ON conversations(timestamp DESC);
```

**Foreign Key:**
- contact_id references contacts(id)
- No CASCADE delete (preserve conversation history)

**Fields:**
- `is_from_contact`: TRUE = user message, FALSE = bot response
- `intent`: spam, personal, support (NULL for bot messages)
- `response_generated`: What bot replied (NULL for bot messages)

---

## Input Sanitization

**Location:** `src/services/contactService.js:204`

### Contact Name Sanitization

```javascript
sanitizeInput(input) {
    if (!input || typeof input !== 'string') return null;

    return input
        .replace(/[<>"'`]/g, '')              // Remove HTML/SQL chars
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control chars
        .trim()
        .substring(0, MAX_NAME_LENGTH);        // Max 100 chars
}
```

**Removes:**
- HTML injection chars: `<>"`
- SQL injection chars: `'`
- JavaScript chars: `` ` ``
- Control characters (0x00-0x1F, 0x7F-0x9F)

---

### Phone Number Sanitization

```javascript
sanitizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;

    return phone
        .replace(/[^\d\+\-\(\)\s]/g, '')  // Keep only digits, +, -, (), space
        .trim()
        .substring(0, MAX_PHONE_LENGTH);  // Max 20 chars
}
```

**Allows:**
- Digits (0-9)
- Plus sign (+)
- Hyphens (-)
- Parentheses ()
- Spaces

---

## Environment Configuration

**File:** `.env`

**Required Variables:**

```bash
# Ollama Configuration
OLLAMA_URL=http://localhost:11434

# WhatsApp Configuration (optional)
# Session data stored in .wwebjs_auth/

# Database (optional - defaults to database/contacts.db)
# DB_PATH=./database/contacts.db

# Logging (optional - defaults to logs/)
# LOG_PATH=./logs/
```

---

## Constants Configuration

**File:** `src/config/constants.js`

### Time Constants

```javascript
TIME: {
    MINUTES_IN_HOUR: 60,
    HOURS_IN_DAY: 24,
    MS_IN_SECOND: 1000,
    MS_IN_MINUTE: 60 * 1000,
    MS_IN_HOUR: 60 * 60 * 1000,
    MS_IN_DAY: 24 * 60 * 60 * 1000,
    FILE_CLEANUP_HOURS: 24,
    AI_TEXT_TIMEOUT: 180000,        // 3 minutes
    AI_VISION_TIMEOUT: 180000,      // 3 minutes
    AI_HEALTH_TIMEOUT: 10000        // 10 seconds
}
```

### File Size Limits

```javascript
FILE_SIZE: {
    LOG_MAX_SIZE: 5 * 1024 * 1024,  // 5MB
    MAX_LOG_FILES: 10
}
```

### AI Models

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

### Weekend Configuration

```javascript
WEEKEND: {
    WEEKEND_DAYS: [5, 6]  // Friday = 5, Saturday = 6
}
```

### Memory Settings

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

### Validation Limits

```javascript
VALIDATION: {
    MAX_NAME_LENGTH: 100,
    MAX_PHONE_LENGTH: 20
}
```

---

## Logging System

**Engine:** Winston
**Location:** `src/utils/logger.js`

### Configuration

```javascript
{
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info =>
            `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'logs/liora.log',
            maxsize: 5 * 1024 * 1024,  // 5MB
            maxFiles: 10,
            tailable: true
        })
    ]
}
```

### Log Levels

- **error**: Critical failures
- **warn**: Warnings, non-critical issues
- **info**: General operations, status updates
- **debug**: Detailed debugging info

### Log Files

- **Location:** `logs/liora.log`
- **Rotation:** 5MB max per file
- **Keep:** 10 files
- **Format:** `YYYY-MM-DD HH:mm:ss [LEVEL]: message`

---

## WhatsApp Integration

**Library:** whatsapp-web.js v1.23.0
**Browser:** Puppeteer

### Session Persistence

**Location:** `.wwebjs_auth/session/`

**Contents:**
- Authentication tokens
- Session data
- Cached media

**Note:** First run requires QR code scan

### QR Code Authentication

```javascript
whatsappService.on('qr', (qr) => {
    // QR code displayed in terminal
    // Scan with WhatsApp mobile app
    // Session persists after first auth
});
```

### Supported Message Types

| Type | Supported | Handler |
|------|-----------|---------|
| Text | ✅ | Full processing |
| Image | ✅ | Vision model |
| Document | ✅ | Acknowledgment |
| Audio/PTT | ❌ | Ignored |
| Sticker | ✅ | Basic response |
| Location | ✅ | Basic response |
| System | ❌ | Ignored |

---

## Ollama Integration

**Connection:** HTTP REST API
**Endpoint:** `http://localhost:11434`

### Required Models

```bash
# Install required models:
ollama pull gpt-oss:120b      # Text & Intent
ollama pull llava:34b         # Vision
```

### API Endpoints Used

1. **Generate Text:**
   ```
   POST /api/generate
   {
       "model": "gpt-oss:120b",
       "prompt": "...",
       "system": "...",
       "stream": true,
       "options": { "temperature": 0.7, ... }
   }
   ```

2. **Generate Vision:**
   ```
   POST /api/generate
   {
       "model": "llava:34b",
       "prompt": "...",
       "images": ["base64..."],
       "stream": false
   }
   ```

3. **List Models:**
   ```
   GET /api/tags
   ```

### Streaming Implementation

**Location:** `src/services/ollamaService.js:34`

```javascript
response.data.on('data', (chunk) => {
    // Parse JSON chunks
    // Extract 'response' field
    // Accumulate full response
    // Resolve when 'done': true
});
```

**Benefits:**
- Lower perceived latency
- Better user experience
- Progressive response building

---

## Message Deduplication

**Location:** `src/utils/messageTracker.js`

### Implementation

```javascript
class MessageTracker {
    constructor() {
        this.processedMessages = new Map();
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);  // Every 5 minutes
    }

    shouldProcessMessage(message) {
        const key = `${message.from}_${message.id._serialized}`;
        const now = Date.now();

        // Check if processed recently
        if (this.processedMessages.has(key)) {
            const timestamp = this.processedMessages.get(key);
            if (now - timestamp < 5 * 60 * 1000) {  // 5 min window
                return false;  // Skip duplicate
            }
        }

        // Mark as processed
        this.processedMessages.set(key, now);
        return true;  // Process it
    }
}
```

**Window:** 5 minutes
**Cleanup:** Every 5 minutes
**Storage:** In-memory Map

---

## Weekend Auto-Responder

**Location:** `src/utils/businessHours.js`

### Weekend Detection

```javascript
isActiveHour() {
    const now = new Date();
    const dayOfWeek = now.getDay();  // 0=Sunday, 6=Saturday
    const weekendDays = WEEKEND.WEEKEND_DAYS;  // [5, 6]

    return !weekendDays.includes(dayOfWeek);
}
```

**Weekend Days:**
- Friday (5)
- Saturday (6)

### Auto-Response Generation

```javascript
generateOutOfHoursResponse(contactName, relationshipType) {
    // Personalized by relationship
}
```

**Responses:**

| Relationship | Message |
|--------------|---------|
| family | "היי {name}! השבת זה זמן משפחה 💝 אחזור אליך במוצ״ש" |
| friend | "היי {name}! אני במצב שבת עד מוצ״ש ✨" |
| unknown | "שלום! אני במצב שבת ולא זמינה עד מוצאי שבת 🌙" |

---

## Performance Notes

### Database Queries

**Optimized with Indexes:**

1. Conversation history:
   ```sql
   SELECT * FROM conversations
   WHERE contact_id = ?
   ORDER BY timestamp DESC
   LIMIT ?
   ```
   Uses: `idx_conversations_contact_timestamp`

2. Contact lookup:
   ```sql
   SELECT * FROM contacts WHERE id = ?
   ```
   Uses: Primary key index

### Memory Management

**Conversation Cleanup:**
- Triggered: Manual or scheduled
- Keeps: Last 50 messages per contact
- Deletes: Older messages via ROW_NUMBER() window function

**Temp File Cleanup:**
- Triggered: Manual
- Deletes: Files older than 24 hours
- Location: `temp/`

### Intent Cache

**Implementation:** In-memory Map
- **Max Size:** 100 entries
- **TTL:** 1 hour
- **Eviction:** LRU (removes 20 oldest)

---

## Error Recovery

### Retry Logic

**Location:** `src/services/ollamaService.js:37`

```javascript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
        // Try operation
        return result;
    } catch (error) {
        if (attempt === maxRetries) throw error;
        await sleep(retryDelay);  // 1 second
    }
}
```

**Configuration:**
- Max retries: 2
- Delay: 1 second between attempts
- Applies to: AI generation, health checks

### Graceful Degradation

1. **MessageTracker fails** → Process message anyway
2. **Memory retrieval fails** → Continue with empty context
3. **Intent fails** → Default to 'personal'
4. **Validation fails** → Use fallback response
5. **Database query fails** → Log error, return null/empty

---

## Deployment

### Manual Deployment

```bash
# Install dependencies
npm install

# Start Ollama (separate terminal)
ollama serve

# Pull models
ollama pull gpt-oss:120b
ollama pull llava:34b

# Create .env file
echo "OLLAMA_URL=http://localhost:11434" > .env

# Start bot
npm start
```

---

## Monitoring

### Health Checks

**Ollama Health:**
```javascript
await ollamaService.healthCheck();
// Returns: true/false
```

**Database Stats:**
```javascript
await contactService.getDatabaseStats();
// Returns: { contacts: N, conversations: N }
```

### Logging

**Key Log Messages:**

```
🚀 Starting LIORA WhatsApp Bot...
✅ LIORA bot started successfully
LIORA bot is ready! 🤖

🤖 Sending response to [contact] [score: 85/100]
✅ Responded to [contact] (chat)

⚠️ Weekend mode: Sending auto-response
❌ Failed to start LIORA bot: [error]
```

---

## Security Notes

1. **No External APIs:**
   - All AI runs locally
   - No data leaves server

2. **Input Sanitization:**
   - SQL injection prevention
   - XSS protection
   - Control character removal

3. **Response Validation:**
   - No personal info leakage
   - Phone number detection
   - Email address detection
   - URL validation

4. **Database:**
   - No plaintext passwords stored
   - Foreign key constraints
   - CHECK constraints for data integrity

5. **Session Security:**
   - WhatsApp session encrypted by library
   - Session files in `.wwebjs_auth/`
   - Not committed to version control

---

## Known Limitations

1. **Voice Messages:** Not processed (ignored)
2. **Group Chats:** Not explicitly handled
3. **Media Storage:** Downloaded media not persisted
4. **Scalability:** Single-instance, not horizontally scalable
5. **Language:** Primarily Hebrew, limited multilingual support

---

## Troubleshooting

### Ollama Connection Failed

```
Error: connect ECONNREFUSED localhost:11434
```

**Solution:**
1. Ensure Ollama is running: `ollama serve`
2. Check OLLAMA_URL in .env
3. Test: `curl http://localhost:11434/api/tags`

### WhatsApp Session Lost

```
WhatsApp client disconnected: CONFLICT
```

**Solution:**
1. Delete `.wwebjs_auth/` folder
2. Restart bot
3. Scan QR code again

### Database Locked

```
Error: SQLITE_BUSY: database is locked
```

**Solution:**
1. Close other DB connections
2. Restart bot
3. Check file permissions

### High Memory Usage

**Solution:**
1. Run database cleanup: `contactService.cleanupOldData()`
2. Reduce MEMORY.LONG_TERM_MESSAGES in constants
3. Clear intent cache manually if needed
