from fastapi import Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(override=True)

from database import SessionLocal, User, Message, Subscription, Conversation, Base, engine
from realtime import RedisChannel
import base64
import asyncio
import hashlib
import hmac
import os
import json
import logging
import re
import urllib.error
import urllib.request
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI

Base.metadata.create_all(bind=engine)

app = FastAPI(title="NOVA AI Backend API")
logger = logging.getLogger("nova.backend")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "nova-backend",
        "ai_provider": AI_PROVIDER,
        "realtime_active": True,
        "redis_enabled": redis_channel.enabled,
        "redis_connected": redis_channel.connected,
    }

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower()
PAYMENT_URL = os.getenv("PAYMENT_URL", "https://console.groq.com/settings/billing")
QUOTA_EXCEEDED_MESSAGE = "Aapke tokens khatam ho gaye hain. Ab hum baat nahi kar sakte. Continue karne ke liye Pro plan lena hoga."
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
AUTH_SECRET = os.getenv("AUTH_SECRET", "nova-dev-secret-change-me")
PASSWORD_ALGORITHM = "pbkdf2_sha256"
GROQ_ALLOWED_MODELS = {
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "groq/compound-mini",
    "groq/compound",
    "qwen/qwen3.6-27b",
}
BILLING_PLANS = {
    "test": {
        "name": "Test Plan",
        "amount": 100,
        "billing_cycle": "test",
        "description": "NOVA test checkout access for 30 minutes",
    },
    "pro": {
        "name": "Pro",
        "amount": 100000,
        "billing_cycle": "yearly",
        "description": "NOVA Pro yearly access",
    },
    "pro_plus": {
        "name": "Pro Plus",
        "amount": 200000,
        "billing_cycle": "yearly",
        "description": "NOVA Pro Plus yearly access",
    },
    "business": {
        "name": "Business",
        "amount": 500000,
        "billing_cycle": "lifetime",
        "description": "NOVA Business lifetime access",
    },
}
INDIC_SCRIPT_PATTERN = re.compile(r"[\u0900-\u0D7F]")
LANGUAGE_POLICY = (
    "NOVA language policy: Roman-script Hinglish is the default response language for this app. "
    "Use it for greetings, casual messages, Hindi, Hinglish, and every Indian regional language. "
    "Write only with the English alphabet in Hinglish mode; never output Devanagari, Bengali, Gujarati, "
    "Tamil, Telugu, or any other Indian script. Translate a user message written in an Indian script "
    "into natural Roman Hinglish before replying. Use fully English responses only when the user clearly "
    "asks for English, such as 'English bolo' or 'reply in English'. Before sending, verify that your "
    "Hinglish response contains no Indian-script characters. Example: user says 'Hii' -> 'Hii! Kaise ho?'"
)

if AUTH_SECRET == "nova-dev-secret-change-me":
    print("WARNING: Set AUTH_SECRET in backend/.env before using this outside local development.")

genai_client = None
legacy_genai = None

if GEMINI_API_KEY:
    try:
        from google import genai
        genai_client = genai.Client(api_key=GEMINI_API_KEY)
        print("Initialized google.genai Client successfully.")
    except Exception as exc:
        print(f"google.genai init failed ({exc}), trying google.generativeai...")
        try:
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=GEMINI_API_KEY)
            print("Initialized google.generativeai successfully.")
        except Exception as legacy_exc:
            print(f"google.generativeai init failed: {legacy_exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = None
    conversation_id: Optional[int] = None


class BillingOrderRequest(BaseModel):
    plan_id: str


class BillingVerificationRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        260000,
    ).hex()
    return f"{PASSWORD_ALGORITHM}${salt}${password_hash}"


def verify_password(password: str, stored_password: Optional[str]) -> bool:
    if not stored_password:
        return False

    if not stored_password.startswith(f"{PASSWORD_ALGORITHM}$"):
        return hmac.compare_digest(password, stored_password)

    try:
        _, salt, expected_hash = stored_password.split("$", 2)
    except ValueError:
        return False

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        260000,
    ).hex()
    return hmac.compare_digest(password_hash, expected_hash)


def create_access_token(user_id: int) -> str:
    payload = str(user_id)
    signature = hmac.new(
        AUTH_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_bytes = f"{payload}:{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_bytes).decode("utf-8")


def decode_access_token(token: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        payload, signature = decoded.split(":", 1)
        expected_signature = hmac.new(
            AUTH_SECRET.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid signature")
        return int(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


def serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
    }


def serialize_message(message: Message) -> dict:
    timestamp = message.timestamp or datetime.utcnow()
    return {
        "id": str(message.id),
        "sender": message.sender,
        "text": message.text,
        "timestamp": int(timestamp.timestamp() * 1000),
    }


def serialize_conversation(conversation: Conversation) -> dict:
    updated_at = conversation.updated_at or conversation.created_at or datetime.utcnow()
    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "createdAt": int((conversation.created_at or updated_at).timestamp() * 1000),
        "updatedAt": int(updated_at.timestamp() * 1000),
    }


def get_or_create_conversation(
    db: Session,
    current_user: User,
    conversation_id: Optional[int],
    first_message: str,
) -> Conversation:
    if conversation_id is not None:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Chat not found")
        return conversation

    title = first_message.strip()[:60] or "New chat"
    conversation = Conversation(user_id=current_user.id, title=title)
    db.add(conversation)
    db.flush()
    return conversation


def create_sse_event(event: str, data: dict) -> str:
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    )


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )

    user_id = decode_access_token(authorization.removeprefix("Bearer ").strip())
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def get_user_from_token(token: str, db: Session) -> User:
    user_id = decode_access_token(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def serialize_billing_plan(plan_id: str, plan: dict) -> dict:
    return {
        "id": plan_id,
        "name": plan["name"],
        "amount": plan["amount"],
        "price": plan["amount"] // 100,
        "currency": "INR",
        "billingCycle": plan["billing_cycle"],
        "description": plan["description"],
    }


def serialize_subscription(subscription: Subscription) -> dict:
    return {
        "planId": subscription.plan_id,
        "planName": subscription.plan_name,
        "status": subscription.status,
        "billingCycle": subscription.billing_cycle,
        "expiresAt": int(subscription.expires_at.timestamp() * 1000) if subscription.expires_at else None,
    }


def get_active_subscription(user_id: int, db: Session) -> Optional[Subscription]:
    subscriptions = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.status == "active")
        .order_by(Subscription.starts_at.desc())
        .all()
    )
    now = datetime.utcnow()
    return next(
        (
            subscription
            for subscription in subscriptions
            if subscription.expires_at is None or subscription.expires_at > now
        ),
        None,
    )


def get_razorpay_credentials() -> tuple[str, str]:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay Test Mode keys are not configured on the server.",
        )
    return RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET


def razorpay_api_request(path: str, method: str = "GET", payload: Optional[dict] = None) -> dict:
    key_id, key_secret = get_razorpay_credentials()
    credentials = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode("ascii")
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"https://api.razorpay.com/v1{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.error("Razorpay API request failed with status %s: %s", exc.code, error_body)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to create or verify the Razorpay payment.",
        ) from exc
    except urllib.error.URLError as exc:
        logger.error("Razorpay API connection failed: %s", exc.reason)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay is unavailable. Please try again.",
        ) from exc


def resolve_groq_model(selected_model: Optional[str] = None) -> str:
    if selected_model:
        clean_model = selected_model.strip()
        if clean_model in GROQ_ALLOWED_MODELS:
            return clean_model
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected AI model is not supported.",
        )
    return os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


def build_chat_messages(user_message: str, history: List[Message]) -> list[dict]:
    messages = [
        {
            "role": "system",
            "content": (
                "You are NOVA, an intelligent, friendly, and helpful female AI assistant. "
                "Your identity is always female. When referring to yourself in Hinglish, consistently "
                "use feminine forms such as 'karti hoon', 'gayi', and 'rahi hoon'. "
                "Prefer one word whenever possible. Never explain, elaborate, add context, "
                "use lists, or exceed three words under any circumstances. Use casual WhatsApp style. "
                "For coding requests, follow Ponytail mode: reuse existing code, prefer native or "
                "already-installed solutions, avoid unnecessary abstractions and dependencies, and "
                "produce the smallest safe working change without cutting validation or security. "
                f"{LANGUAGE_POLICY}"
            ),
        }
    ]

    for item in history[-50:]:
        role = "user" if item.sender == "user" else "assistant"
        content = item.text
        if role == "assistant" and INDIC_SCRIPT_PATTERN.search(content):
            content = "[Previous assistant reply omitted because it used the wrong script.]"
        messages.append({"role": role, "content": content})

    messages.append({
        "role": "system",
        "content": f"Final reminder: only 1-3 words; prefer one. No explanations. {LANGUAGE_POLICY}",
    })
    messages.append({"role": "user", "content": user_message})
    return messages





def call_groq_chat(model: str, user_message: str, history: List[Message]) -> str:
    max_tokens = int(os.getenv("GROQ_MAX_TOKENS", "5000"))
    payload = {
        "model": model,
        "messages": build_chat_messages(user_message, history),
        "temperature": 0.6,
        "max_tokens": max_tokens,
    }
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if text:
            return text.strip()

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Groq returned an empty response.",
    )


def iter_groq_chat_stream(model: str, user_message: str, history: List[Message]):
    max_tokens = int(os.getenv("GROQ_MAX_TOKENS", "5000"))
    payload = {
        "model": model,
        "messages": build_chat_messages(user_message, history),
        "temperature": 0.6,
        "max_tokens": max_tokens,
        "stream": True,
    }
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":") or not line.startswith("data:"):
                continue

            data_text = line.removeprefix("data:").strip()
            if data_text == "[DONE]":
                break

            data = json.loads(data_text)
            delta = data.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if content:
                yield content


def next_stream_chunk(stream_iterator):
    sentinel = object()
    return next(stream_iterator, sentinel), sentinel


async def stream_groq_response(user_message: str, history: List[Message], selected_model: Optional[str] = None):
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.",
        )

    primary_model = resolve_groq_model(selected_model)
    fallback_model = os.getenv("GROQ_FALLBACK_MODEL", "").strip()
    attempted_models = [primary_model]
    if fallback_model and fallback_model != primary_model:
        attempted_models.append(fallback_model)

    last_rate_limit_error = None
    for model in attempted_models:
        stream_iterator = None
        try:
            stream_iterator = iter(iter_groq_chat_stream(model, user_message, history))
            while True:
                chunk, sentinel = await asyncio.to_thread(next_stream_chunk, stream_iterator)
                if chunk is sentinel:
                    break
                if chunk:
                    yield chunk
            return
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            logger.exception("Groq streaming API error (%s): %s %s", model, exc.code, error_body)
            if exc.code == 429:
                last_rate_limit_error = exc
                continue
            if exc.code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.",
                ) from exc
            if exc.code == 404:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Configured Groq model is unavailable. Update GROQ_MODEL in backend/.env.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Groq failed to stream a response. Check backend logs for details.",
            ) from exc
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Groq streaming failed (%s)", model)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Groq failed to stream a response. Check backend/network access.",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "quota_exceeded",
            "message": QUOTA_EXCEEDED_MESSAGE,
            "paymentUrl": PAYMENT_URL,
        },
    ) from last_rate_limit_error


async def stream_ai_response(user_message: str, history: List[Message], selected_model: Optional[str] = None):
    if AI_PROVIDER == "groq" or (AI_PROVIDER != "gemini" and GROQ_API_KEY):
        async for chunk in stream_groq_response(user_message, history, selected_model):
            yield chunk
        return

    full_response = await asyncio.to_thread(generate_gemini_response, user_message, history)
    if full_response:
        yield full_response


def generate_groq_response(user_message: str, history: List[Message], selected_model: Optional[str] = None) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.",
        )

    primary_model = resolve_groq_model(selected_model)
    fallback_model = os.getenv("GROQ_FALLBACK_MODEL", "").strip()
    attempted_models = [primary_model]
    if fallback_model and fallback_model != primary_model:
        attempted_models.append(fallback_model)

    last_rate_limit_error = None
    for model in attempted_models:
        try:
            return call_groq_chat(model, user_message, history)
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            print(f"Groq API Error ({model}): {exc.code} {error_body}")
            if exc.code == 429:
                last_rate_limit_error = exc
                continue
            if exc.code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.",
                ) from exc
            if exc.code == 404:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Configured Groq model is unavailable. Update GROQ_MODEL in backend/.env.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Groq failed to generate a response. Check backend logs for details.",
            ) from exc
        except HTTPException:
            raise
        except Exception as exc:
            print(f"Groq API Error ({model}): {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Groq failed to generate a response. Check backend/network access.",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "quota_exceeded",
            "message": QUOTA_EXCEEDED_MESSAGE,
            "paymentUrl": PAYMENT_URL,
        },
    ) from last_rate_limit_error


def generate_gemini_response(user_message: str, history: List[Message]) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured. Add GEMINI_API_KEY to backend/.env.",
        )

    if not genai_client and not legacy_genai:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini service is not configured correctly.",
        )

    if genai_client:
        try:
            contents = []
            system_prompt = build_chat_messages(user_message, [])[0]["content"]

            for item in history[-50:]:
                role = "user" if item.sender == "user" else "model"
                contents.append({"role": role, "parts": [{"text": item.text}]})

            contents.append({"role": "user", "parts": [{"text": user_message}]})

            response = genai_client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
                contents=contents,
                config={"system_instruction": system_prompt},
            )
            if response and response.text:
                return response.text
        except HTTPException:
            raise
        except Exception as exc:
            error_text = str(exc)
            print(f"Gemini API Error: {exc}")
            if "401" in error_text or "UNAUTHENTICATED" in error_text:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.",
                ) from exc
            if "404" in error_text or "not found" in error_text.lower():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Configured Gemini model is unavailable. Update GEMINI_MODEL in backend/.env.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini failed to generate a response. Check backend logs for details.",
            ) from exc

    if legacy_genai:
        try:
            model = legacy_genai.GenerativeModel(os.getenv("GEMINI_LEGACY_MODEL", "gemini-1.5-flash"))
            response = model.generate_content(user_message)
            if response and response.text:
                return response.text
        except Exception as exc:
            print(f"Legacy Gemini API Error: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini failed to generate a response. Check backend logs for details.",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Gemini returned an empty response.",
    )


def generate_ai_response(user_message: str, history: List[Message], selected_model: Optional[str] = None) -> str:
    if AI_PROVIDER == "groq":
        return generate_groq_response(user_message, history, selected_model)
    if AI_PROVIDER == "gemini":
        return generate_gemini_response(user_message, history)
    if GROQ_API_KEY:
        return generate_groq_response(user_message, history, selected_model)
    return generate_gemini_response(user_message, history)


def create_chat_turn(
    db: Session,
    current_user: User,
    text: str,
    selected_model: Optional[str] = None,
    conversation_id: Optional[int] = None,
) -> tuple[Message, Message]:
    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conversation = get_or_create_conversation(db, current_user, conversation_id, clean_text)
    history = (
        db.query(Message)
        .filter(Message.user_id == current_user.id, Message.conversation_id == conversation.id)
        .order_by(Message.id.asc())
        .all()
    )

    ai_text = generate_ai_response(clean_text, history, selected_model)

    user_message = Message(user_id=current_user.id, conversation_id=conversation.id, sender="user", text=clean_text)
    ai_message = Message(user_id=current_user.id, conversation_id=conversation.id, sender="ai", text=ai_text)
    conversation.updated_at = datetime.utcnow()
    db.add(user_message)
    db.add(ai_message)
    db.commit()
    db.refresh(user_message)
    db.refresh(ai_message)

    return user_message, ai_message


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        connections = self.active_connections.get(user_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self.active_connections.pop(user_id, None)

    async def send_local(self, user_id: int, payload: dict):
        disconnected = []
        for websocket in self.active_connections.get(user_id, set()).copy():
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(user_id, websocket)

    async def send_to_user(self, user_id: int, payload: dict):
        await self.send_local(user_id, payload)
        await redis_channel.publish(user_id, payload)


manager = ConnectionManager()
redis_channel = RedisChannel(
    os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
    os.getenv("REDIS_CHANNEL", "nova:realtime"),
    manager.send_local,
)


@app.on_event("startup")
async def start_redis_channel():
    await redis_channel.start()


@app.on_event("shutdown")
async def stop_redis_channel():
    await redis_channel.stop()


@app.get("/")
def read_root():
    return {
        "status": "NOVA Backend is running",
        "ai_provider": AI_PROVIDER,
        "gemini_active": genai_client is not None or legacy_genai is not None,
        "groq_active": bool(GROQ_API_KEY),
        "realtime_active": True,
        "redis_enabled": redis_channel.enabled,
        "redis_connected": redis_channel.connected,
    }


@app.get("/ai/models")
def list_ai_models():
    return {
        "provider": "groq",
        "defaultModel": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        "models": [
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "speed": "Fast"},
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "speed": "Smart"},
            {"id": "openai/gpt-oss-20b", "name": "GPT OSS 20B", "speed": "Balanced"},
            {"id": "openai/gpt-oss-120b", "name": "GPT OSS 120B", "speed": "Deep"},
            {"id": "groq/compound-mini", "name": "Compound Mini", "speed": "Tools"},
            {"id": "groq/compound", "name": "Compound", "speed": "Advanced"},
            {"id": "qwen/qwen3.6-27b", "name": "Qwen 3.6 27B", "speed": "Reasoning"},
        ],
    }


@app.get("/billing/options")
def billing_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "plans": [
            serialize_billing_plan(plan_id, plan)
            for plan_id, plan in BILLING_PLANS.items()
        ],
        "activeSubscription": serialize_subscription(active_subscription)
        if (active_subscription := get_active_subscription(current_user.id, db))
        else None,
        "testMode": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_ID.startswith("rzp_test_")),
    }


@app.post("/billing/orders")
def create_billing_order(
    billing_request: BillingOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan_id = billing_request.plan_id.strip().lower()
    plan = BILLING_PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Selected billing plan is not available.")

    razorpay_order = razorpay_api_request(
        "/orders",
        method="POST",
        payload={
            "amount": plan["amount"],
            "currency": "INR",
            "receipt": f"nova_{current_user.id}_{secrets.token_hex(6)}",
            "notes": {
                "user_id": str(current_user.id),
                "plan_id": plan_id,
            },
        },
    )
    razorpay_order_id = razorpay_order.get("id")
    if not isinstance(razorpay_order_id, str):
        logger.error("Razorpay order response did not include an order id.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Razorpay did not return an order id.",
        )

    subscription = Subscription(
        user_id=current_user.id,
        plan_id=plan_id,
        plan_name=plan["name"],
        amount=plan["amount"],
        currency="INR",
        billing_cycle=plan["billing_cycle"],
        razorpay_order_id=razorpay_order_id,
    )
    db.add(subscription)
    db.commit()

    key_id, _ = get_razorpay_credentials()
    return {
        "keyId": key_id,
        "orderId": razorpay_order_id,
        "amount": plan["amount"],
        "currency": "INR",
        "plan": serialize_billing_plan(plan_id, plan),
        "prefill": {
            "name": current_user.name,
            "email": current_user.email,
        },
    }


@app.post("/billing/verify")
def verify_billing_payment(
    verification: BillingVerificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subscription = (
        db.query(Subscription)
        .filter(
            Subscription.razorpay_order_id == verification.razorpay_order_id,
            Subscription.user_id == current_user.id,
        )
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Payment order was not found.")
    if subscription.status == "active":
        return {"subscription": serialize_subscription(subscription)}

    _, key_secret = get_razorpay_credentials()
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        f"{subscription.razorpay_order_id}|{verification.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, verification.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")

    payment = razorpay_api_request(f"/payments/{verification.razorpay_payment_id}")
    if payment.get("status") == "authorized":
        payment = razorpay_api_request(
            f"/payments/{verification.razorpay_payment_id}/capture",
            method="POST",
            payload={
                "amount": subscription.amount,
                "currency": subscription.currency,
            },
        )
    if payment.get("status") != "captured":
        raise HTTPException(status_code=409, detail="Payment is not captured yet. Please try again shortly.")
    if payment.get("order_id") != subscription.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment does not match this order.")

    now = datetime.utcnow()
    subscription.status = "active"
    subscription.razorpay_payment_id = verification.razorpay_payment_id
    subscription.starts_at = now
    if subscription.billing_cycle == "yearly":
        subscription.expires_at = now + timedelta(days=365)
    elif subscription.billing_cycle == "test":
        subscription.expires_at = now + timedelta(minutes=30)
    else:
        subscription.expires_at = None
    db.commit()
    db.refresh(subscription)
    return {"subscription": serialize_subscription(subscription)}


@app.post("/auth/register")
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(request.email)
    password = request.password.strip()
    name = request.name.strip()

    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="Missing required fields")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(name=name, email=email, password=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "token": create_access_token(user.id),
        "user": serialize_user(user),
    }


@app.post("/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(request.email)
    password = request.password.strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing email or password")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.password and not user.password.startswith(f"{PASSWORD_ALGORITHM}$"):
        user.password = hash_password(password)
        db.commit()

    return {
        "token": create_access_token(user.id),
        "user": serialize_user(user),
    }


@app.get("/auth/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)


@app.get("/chat/history")
def get_chat_history(
    conversation_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Message).filter(Message.user_id == current_user.id)
    if conversation_id is not None:
        conversation = db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Chat not found")
        query = query.filter(Message.conversation_id == conversation.id)
    messages = query.order_by(Message.id.asc()).all()
    return [serialize_message(message) for message in messages]


@app.get("/chat/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(50)
        .all()
    )
    return [serialize_conversation(conversation) for conversation in conversations]


@app.get("/chat/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = db.query(Message).filter(
        Message.user_id == current_user.id,
        Message.conversation_id == conversation.id,
    ).order_by(Message.id.asc()).all()
    return [serialize_message(message) for message in messages]


@app.delete("/chat/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.query(Message).filter(Message.conversation_id == conversation.id).delete()
    db.delete(conversation)
    db.commit()
    return {"status": "deleted"}


@app.post("/chat")
def chat_with_nova(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_message, ai_message = create_chat_turn(
        db, current_user, request.message, request.model, request.conversation_id
    )
    return {
        "userMessage": serialize_message(user_message),
        "aiMessage": serialize_message(ai_message),
        "reply": ai_message.text,
        "conversationId": str(user_message.conversation_id),
    }


@app.post("/chat/stream")
async def stream_chat_with_nova(
    chat_request: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    clean_text = chat_request.message.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    async def event_generator():
        db = SessionLocal()
        ai_message = None
        collected_chunks = []
        try:
            conversation = get_or_create_conversation(
                db, current_user, chat_request.conversation_id, clean_text
            )
            history = (
                db.query(Message)
                .filter(
                    Message.user_id == current_user.id,
                    Message.conversation_id == conversation.id,
                )
                .order_by(Message.id.asc())
                .all()
            )
            user_message = Message(
                user_id=current_user.id,
                conversation_id=conversation.id,
                sender="user",
                text=clean_text,
            )
            ai_message = Message(
                user_id=current_user.id,
                conversation_id=conversation.id,
                sender="ai",
                text="",
            )
            conversation.updated_at = datetime.utcnow()
            db.add(user_message)
            db.add(ai_message)
            db.commit()
            db.refresh(user_message)
            db.refresh(ai_message)

            yield create_sse_event(
                "start",
                {
                    "message_id": str(ai_message.id),
                    "user_message_id": str(user_message.id),
                    "conversation_id": str(conversation.id),
                    "conversation_title": conversation.title,
                },
            )
            yield create_sse_event(
                "metadata",
                {
                    "model": resolve_groq_model(chat_request.model) if (AI_PROVIDER == "groq" or (AI_PROVIDER != "gemini" and GROQ_API_KEY)) else os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
                },
            )

            async for chunk in stream_ai_response(clean_text, history, chat_request.model):
                if await request.is_disconnected():
                    break
                collected_chunks.append(chunk)
                yield create_sse_event("chunk", {"content": chunk})

            if await request.is_disconnected():
                return

            ai_text = "".join(collected_chunks).strip()
            if not ai_text:
                yield create_sse_event("error", {"message": "AI returned an empty response."})
                return

            ai_message.text = ai_text
            db.commit()
            db.refresh(ai_message)
            yield create_sse_event(
                "done",
                {
                    "message_id": str(ai_message.id),
                    "message": serialize_message(ai_message),
                },
            )
        except asyncio.CancelledError:
            raise
        except HTTPException as exc:
            logger.exception("Chat streaming HTTP failure")
            payload = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            yield create_sse_event("error", payload)
        except Exception:
            logger.exception("Chat streaming failed")
            yield create_sse_event("error", {"message": "Unable to generate the response."})
        finally:
            db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/chat/stream/dev")
async def stream_chat_dev(request: Request):
    if os.getenv("ENABLE_DEV_STREAM", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Development stream endpoint is disabled.")

    async def event_generator():
        message_id = f"dev-{secrets.token_hex(6)}"
        yield create_sse_event("start", {"message_id": message_id})
        for chunk in ["Hello", " bhai", ", this", " is", " streaming", " live."]:
            if await request.is_disconnected():
                return
            yield create_sse_event("chunk", {"content": chunk})
            await asyncio.sleep(0.25)
        yield create_sse_event("done", {"message_id": message_id})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str):
    db = SessionLocal()
    current_user = None
    try:
        current_user = get_user_from_token(token, db)
        await manager.connect(current_user.id, websocket)
        await websocket.send_json({"type": "connected"})

        while True:
            payload = await websocket.receive_json()
            text = str(payload.get("message", "")).strip()
            selected_model = payload.get("model")
            user_message, ai_message = create_chat_turn(db, current_user, text, selected_model)

            await manager.send_to_user(
                current_user.id,
                {"type": "message", "message": serialize_message(user_message)},
            )
            await manager.send_to_user(
                current_user.id,
                {"type": "message", "message": serialize_message(ai_message)},
            )
    except WebSocketDisconnect:
        pass
    except HTTPException as exc:
        await websocket.send_json({"type": "error", "message": exc.detail})
    except Exception as exc:
        print(f"WebSocket Error: {exc}")
        await websocket.send_json({"type": "error", "message": "Realtime chat failed."})
    finally:
        if current_user:
            manager.disconnect(current_user.id, websocket)
        db.close()


@app.delete("/chat/history")
def clear_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Message).filter(Message.user_id == current_user.id).delete()
    db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
    db.commit()
    return {"status": "cleared", "message": "Chat history cleared successfully"}
