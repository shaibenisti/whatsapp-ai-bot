# WhatsApp AI Assistant Bot

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Web.js-25D366?logo=whatsapp)
![AI](https://img.shields.io/badge/AI-Ollama-orange.svg)
![Language](https://img.shields.io/badge/Language-Hebrew-4B9FE1.svg)
![Database](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)

An intelligent WhatsApp bot powered by locally-hosted AI models (Ollama), featuring conversational memory, contact management, and natural Hebrew language support.

## ✨ Features

- 🤖 **AI-Powered Conversations**: Uses locally-hosted Ollama models for intelligent, context-aware responses
- 🧠 **Conversation Memory**: Remembers past interactions and maintains context across conversations
- 👥 **Contact Management**: Automatically stores and manages contact information and relationship types
- 🎯 **Intent Classification**: Identifies message intent (spam, personal, support) for appropriate responses
- 👁️ **Vision Support**: Analyzes images sent to the bot using vision-capable AI models
- 🔄 **Message Deduplication**: Prevents duplicate responses and handles rapid messages intelligently
- 🚫 **Spam Detection**: Automatically detects and handles spam messages
- 💾 **SQLite Database**: Persistent storage for contacts and conversation history
- 🇮🇱 **Hebrew Language**: Full Hebrew language support with natural conversation flow

## 📋 Prerequisites

### Required Software

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **Ollama** - [Install Ollama](https://ollama.ai)
4. **Git** - [Download](https://git-scm.com/)

### Required Ollama Models

⚠️ **CRITICAL**: You MUST download these AI models before running the bot:

```bash
# 1. Text generation model (required for conversations)
ollama pull gpt-oss:120b

# 2. Vision analysis model (required for image analysis)
ollama pull llava:34b
```

**Verify models are installed:**
```bash
ollama list
# You should see both gpt-oss:120b and llava:34b
```

**System Requirements:**
- **Disk Space**: ~100GB for both models
- **RAM**: Minimum 16GB (32GB recommended)
- **GPU**: Optional but highly recommended for better performance
- **Ollama**: Must be running (`ollama serve`)

## 🚀 Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/whatsapp-ai-bot.git
   cd whatsapp-ai-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file** with your configuration:
   ```env
   # Bot Personality
   BOT_NAME=YourBotName
   OWNER_NAME=YourName
   OWNER_PHONE=Your-Phone-Number
   OWNER_EMAIL=your-email@example.com

   # Ollama Configuration
   OLLAMA_URL=http://localhost:11434
   ```

5. **Start Ollama** (if not running):
   ```bash
   ollama serve
   ```

6. **Run the bot**:
   ```bash
   npm start
   ```

## 📱 First-Time WhatsApp Setup

1. Run the bot (`npm start`)
2. A QR code will be displayed in the terminal/logs
3. Open WhatsApp on your phone
4. Go to **Settings > Linked Devices > Link a Device**
5. Scan the QR code displayed by the bot
6. ✅ The bot is now connected and ready!

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_NAME` | Name of your bot | `העוזר הוירטואלי` | No |
| `OWNER_NAME` | Your name (for bot responses) | `המשתמש` | No |
| `OWNER_PHONE` | Contact phone number | - | No |
| `OWNER_EMAIL` | Contact email | - | No |
| `OLLAMA_URL` | Ollama API endpoint | `http://localhost:11434` | Yes |
| `NODE_ENV` | Environment (development/production) | `production` | No |
| `LOG_LEVEL` | Logging level (info/debug/error) | `info` | No |
| `WHATSAPP_SESSION_ID` | WhatsApp session identifier | `my-bot-session` | No |
| `TIMEZONE` | Timezone for the bot | `Asia/Jerusalem` | No |

### Customizing Bot Personality

Edit `src/config/personas.js` to customize how your bot communicates.

### Customizing AI Prompts

Edit `src/config/prompts.js` to modify intent classification and other AI behaviors.

## 📁 Project Structure

```
whatsapp-ai-bot/
├── src/
│   ├── config/              # Configuration files
│   │   ├── constants.js     # App constants
│   │   ├── personas.js      # Bot personality
│   │   └── prompts.js       # AI prompts
│   ├── services/            # Core business logic
│   │   ├── whatsappService.js
│   │   ├── ollamaService.js
│   │   ├── contactService.js
│   │   ├── messageProcessor.js
│   │   ├── memoryService.js
│   │   └── webService.js    # QR-code web interface
│   ├── utils/               # Utility functions
│   │   ├── logger.js
│   │   ├── responseValidator.js
│   │   └── messageTracker.js
│   └── index.js             # Application entry point
├── database/                # SQLite database storage
├── logs/                    # Application logs
├── .env.example             # Environment variables template
└── package.json             # Node.js dependencies
```

## 🔧 Development

### Running in Development Mode

```bash
npm run dev
```

This uses `nodemon` to automatically restart the bot when you make changes.

### Viewing Logs

```bash
# View combined logs
tail -f logs/combined.log

# View error logs only
tail -f logs/error.log
```

## 🐛 Troubleshooting

### Bot not responding

**Problem**: Bot doesn't reply to messages

**Solutions**:
1. Check Ollama is running: `ollama list`
2. Verify models are installed (see Prerequisites section)
3. Check logs: `tail -f logs/combined.log`
4. Verify `.env` file is configured correctly
5. Ensure Ollama URL is accessible: `curl http://localhost:11434`

### QR Code not appearing

**Problem**: QR code doesn't show on startup

**Solutions**:
1. Delete WhatsApp session: `rm -rf database/whatsapp-auth/`
2. Restart the bot
3. A new QR code should appear
4. Make sure terminal supports QR code display

### Ollama connection errors

**Problem**: Cannot connect to Ollama

**Solutions**:
1. Start Ollama: `ollama serve`
2. Verify models are downloaded: `ollama list`
3. Check Ollama is accessible: `curl http://localhost:11434/api/version`
4. Update `OLLAMA_URL` in `.env` if running on different host

### Database errors

**Problem**: SQLite database errors

**Solutions**:
1. Ensure `database/` directory exists and is writable
2. Check file permissions: `chmod 755 database/`
3. Reset database (⚠️ loses all data): `rm database/contacts.db`

### Out of memory errors

**Problem**: System runs out of RAM

**Solutions**:
1. Use smaller Ollama models (check Ollama library)
2. Increase system swap space
3. Close other applications
4. Upgrade to system with more RAM (32GB recommended)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- Powered by [Ollama](https://ollama.ai)
- Uses [Winston](https://github.com/winstonjs/winston) for logging

## 📞 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**⚠️ Important Notice**: This bot is for educational and personal use. Make sure to comply with WhatsApp's Terms of Service when using automated messaging.
