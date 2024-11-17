# Textframe API

A FastAPI-based service that provides secure access to YouTube video transcript searching using Google's Gemini AI model.

## 🔑 Features

- Secure authentication using public key cryptography
- YouTube transcript extraction with proxy support
- AI-powered transcript search using Google's Gemini
- Request tracking and metadata storage using PocketBase
- CORS protection for the textframe Chrome Extension

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- Docker (for containerized deployment)
- PocketBase instance
- Google Gemini API access
- HTTPS Proxy credentials (for YouTube access)

### Environment Variables

```env
DB_URL=your_pocketbase_url
EXTENSION_ID=your_chrome_extension_id
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL_NAME=your_model_name
PROXY_USERNAME=your_proxy_username
PROXY_PASSWORD=your_proxy_password
PROXY_DOMAIN=your_proxy_domain
PROXY_PORT=your_proxy_port
```

### Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
fastapi dev main.py
```

see [FastAPI](https://fastapi.tiangolo.com/tutorial/first-steps/) for more info

### Docker Deployment

1. Build the image:
```bash
docker build -t textframe-api .
```

2. Run the container:
```bash
docker run -d \
  -p 80:80 \
  --env-file .env \
  textframe-api
```

## 🔒 Security

The API implements a secure authentication flow:

1. Client registers their public key
2. Client requests a nonce
3. Client signs the nonce with their private key
4. API verifies the signature before processing requests

## 📡 API Endpoints

### POST /register_public_key
Register a new public key for authentication.
```json
{
  "uuid": "user_unique_id",
  "public_key": "base64_encoded_public_key"
}
```

### POST /get_nonce
Get a nonce for request signing.
```
Header: X-UUID: user_unique_id
```

### POST /search
Search video transcripts.
```
Headers:
  X-UUID: user_unique_id
  X-Nonce-Signature: signed_nonce

Body:
{
  "query": "search_query",
  "video_id": "youtube_video_id"
}
```

## 📦 Dependencies

- FastAPI - Web framework
- PocketBase - Database
- youtube_transcript_api - Transcript extraction
- google.generativeai - Gemini AI integration
- PyNaCl - Cryptographic operations
- Pydantic - Data validation

## 🏗️ Project Structure

```
python-api/
├── app/
│   └── main.py          # Main application file
├── Dockerfile           # Container definition
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

## 🔍 Logging and Monitoring

The API tracks usage metrics in PocketBase:
- Token usage
- User queries
- AI responses
- User identifiers

## 📄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License - see the [LICENSE](../LICENSE) file for details.