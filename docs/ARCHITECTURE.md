# Liora v0.1 - System Architecture

## Overview

Liora is an intelligent WhatsApp bot assistant built with Node.js. It provides personalized conversational AI responses using locally-hosted Ollama models, with memory persistence, unified natural personality, and weekend auto-responder functionality.

## Core Components

### 1. Main Application (`src/index.js`)

**LioraBot** - Main orchestrator class that:
- Initializes all services
- Sets up event listeners for WhatsApp events
- Handles business hours logic (weekend silence mode)
- Manages message deduplication
- Implements graceful shutdown

**Key Features:**
- Message deduplication via MessageTracker
- Weekend auto-responder (Friday-Saturday silence)
- Graceful shutdown handling (SIGINT/SIGTERM)
- Error recovery and fallback logic

---

### 2. Services Layer

#### **WhatsAppService** (`src/services/whatsappService.js`)
- WhatsApp Web integration via whatsapp-web.js
- QR code authentication
- Message sending/receiving
- Media handling (images, documents, audio)
- Contact information retrieval
- Message read receipts

#### **OllamaService** (`src/services/ollamaService.js`)
- Local AI model integration
- Streaming response generation
- Intent classification
- Image analysis via vision models
- Retry logic with exponential backoff
- Intent caching for performance

**Models Used:**
- Text: `gpt-oss:120b`
- Intent: `gpt-oss:120b`
- Vision: `llava:34b`

#### **MessageProcessor** (`src/services/messageProcessor.js`)
- Central message routing and processing
- Handles text, images, documents, stickers, locations
- Integrates AI, memory, and validation systems
- Unified personality for all conversations
- Response validation and safety checks

#### **ContactService** (`src/services/contactService.js`)
- SQLite database for contact persistence
- Conversation history logging
- Relationship classification (family, friend, unknown, spam)
- Spam detection and appeal system
- Database cleanup and maintenance

#### **MemoryService** (`src/services/memoryService.js`)
- Conversation context management
- Short-term memory (last 10 messages)
- Long-term memory (last 50 messages)
- Key information extraction
- Context summarization

#### **PDFService** (`src/services/pdfService.js`)
- Temporary file management
- Automatic cleanup of old files (24 hours)

---

### 3. Utilities Layer

#### **Logger** (`src/utils/logger.js`)
- Winston-based structured logging
- File rotation (5MB max, 10 files)
- Console and file outputs
- Timestamp formatting

#### **BusinessHours** (`src/utils/businessHours.js`)
- Weekend detection (Friday-Saturday)
- Personalized out-of-hours messages
- Relationship-aware auto-responses

#### **MessageTracker** (`src/utils/messageTracker.js`)
- Deduplication of messages
- Prevents rapid-fire message processing
- Sliding window tracking (5 minutes)
- Automatic cleanup

#### **ResponseValidator** (`src/utils/responseValidator.js`)
- Response quality scoring
- Language detection (Hebrew validation)
- Safety checks (no personal info leakage)
- Tone appropriateness validation
- Fallback responses

---

### 4. Configuration Layer

#### **Constants** (`src/config/constants.js`)
Centralized configuration:
- **TIME**: Timeouts, cleanup intervals
- **FILE_SIZE**: Log file limits
- **AI_MODELS**: Model names, parameters, tokens
- **WEEKEND**: Weekend day definitions
- **MEMORY**: Message retention, context limits
- **VALIDATION**: Input sanitization limits

#### **Personality** (`src/config/personas.js`)
Defines Liora's unified AI personality:
- **default**: Single "Balanced & Natural" personality for all interactions
- Natural, warm Hebrew communication
- Adapts energy to conversation context

#### **Prompts** (`src/config/prompts.js`)
System prompts for AI:
- **intentClassification**: Categorizes messages (spam, personal, support)

---

## Data Flow

```
WhatsApp Message
    ↓
MessageTracker (deduplication)
    ↓
BusinessHours check
    ↓
MessageProcessor
    ↓
├─ ContactService (get/create contact)
├─ MemoryService (retrieve context)
├─ OllamaService (classify intent)
└─ OllamaService (generate response)
    ↓
ResponseValidator (validate quality)
    ↓
WhatsAppService (send response)
    ↓
ContactService (log conversation)
```

---

## Database Schema

**SQLite Database** (`database/contacts.db`)

### Tables:

1. **contacts**
   - id (TEXT, primary key)
   - name (TEXT, required)
   - phone (TEXT, optional)
   - relationship_type (family, friend, unknown, spam)
   - is_spam (BOOLEAN)
   - notes (TEXT)
   - created_at, updated_at (DATETIME)

2. **conversations**
   - id (INTEGER, auto-increment)
   - contact_id (TEXT, foreign key)
   - message_id (TEXT)
   - message_content (TEXT)
   - message_type (TEXT)
   - is_from_contact (BOOLEAN)
   - intent (TEXT)
   - response_generated (TEXT)
   - timestamp (DATETIME)

### Indexes:
- `idx_conversations_contact_timestamp`: Fast conversation history retrieval
- `idx_contacts_relationship`: Contact relationship tracking
- `idx_conversations_timestamp`: Chronological sorting

---

## Technology Stack

- **Runtime**: Node.js
- **WhatsApp**: whatsapp-web.js
- **AI**: Ollama (local models)
- **Database**: SQLite3
- **Logging**: Winston
- **Media**: Puppeteer (WhatsApp Web rendering)
- **Environment**: dotenv

---

## Deployment

- Environment variables via `.env`
- Graceful shutdown handling
- Automatic reconnection logic
- Session persistence

---

## Key Design Principles

1. **Local-First**: All AI processing runs locally via Ollama
2. **Privacy-Focused**: No external API calls for AI
3. **Authentically Human**: Single unified personality for natural, consistent interactions
4. **Memory-Enabled**: Conversation context maintained
5. **Weekend-Aware**: Silent mode Friday-Saturday
6. **Resilient**: Fallback logic throughout
7. **Validated**: All responses checked for quality and safety
