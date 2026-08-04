# NOVA Backend

## Required configuration

Create `backend/.env` with real values:

```env
GEMINI_API_KEY=your_google_ai_studio_gemini_key
AUTH_SECRET=replace_with_a_long_random_secret
GEMINI_MODEL=gemini-2.5-flash-lite
ALLOWED_ORIGINS=*
```

`GEMINI_API_KEY` must be a Gemini API key from Google AI Studio. Firebase Web API keys or OAuth tokens will not work for Gemini generation.

## Run

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
