# Quiz Funnel Backend API

Backend API for Quiz Funnel E-commerce Analytics application.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (running on port 5432)
- Database named `quiz_funnel` with the required tables

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Setup:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your database credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=quiz_funnel
   DB_USER=your_username
   DB_PASSWORD=your_password
   PORT=3001
   NODE_ENV=development
   ```

3. **Seed the database:**
   ```bash
   npm run seed
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

## 📊 API Endpoints

### Health Check
- **GET** `/health` - Server health status

### Session Management
- **POST** `/session/start` - Start a new quiz session

#### POST /session/start
**Request Body:**
```json
{
  "quiz_id": "quiz_001",
  "utm_source": "google",
  "utm_campaign": "fitness_quiz",
  "utm_medium": "cpc",
  "utm_term": "fitness quiz",
  "utm_content": "ad_variant_a"
}
```

**Response:**
```json
{
  "session_id": "uuid-string",
  "success": true,
  "message": "Session started successfully"
}
```

## 🗄️ Database Schema

The following tables are required:

- **quizzes** - Static quiz content
- **questions** - Question definitions with sequence order
- **answer_options** - Available answer choices
- **user_sessions** - Dynamic session tracking
- **user_answers** - User response data

## 🛠️ Development

- **Build:** `npm run build`
- **Start production:** `npm start`
- **Development:** `npm run dev`

## 📝 Next Steps

This is Phase A implementation. Future phases will include:
- Session update endpoints
- Answer submission endpoints
- Session completion endpoints
- GTM integration support
