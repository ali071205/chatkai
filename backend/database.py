import os

from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nova.db")

engine_kwargs = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String, nullable=True)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, nullable=False, default="New chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), index=True, nullable=True)
    sender = Column(String)  # 'user' or 'ai'
    text = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    plan_id = Column(String, nullable=False)
    plan_name = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    currency = Column(String, nullable=False, default="INR")
    billing_cycle = Column(String, nullable=False)
    status = Column(String, nullable=False, default="created")
    razorpay_order_id = Column(String, unique=True, index=True, nullable=False)
    razorpay_payment_id = Column(String, unique=True, index=True, nullable=True)
    starts_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create all tables in the database
Base.metadata.create_all(bind=engine)

def ensure_schema():
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        Base.metadata.create_all(bind=engine)
        return

    message_columns = {column["name"] for column in inspector.get_columns("messages")}
    if "user_id" not in message_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE messages ADD COLUMN user_id INTEGER"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_user_id ON messages (user_id)"))

    message_columns = {column["name"] for column in inspect(engine).get_columns("messages")}
    if "conversation_id" not in message_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE messages ADD COLUMN conversation_id INTEGER"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages (conversation_id)"))

    # Keep old messages by placing each user's legacy history in one conversation.
    with engine.begin() as connection:
        legacy_users = connection.execute(
            text("SELECT DISTINCT user_id FROM messages WHERE user_id IS NOT NULL AND conversation_id IS NULL")
        ).fetchall()
        for (user_id,) in legacy_users:
            first_message = connection.execute(
                text("SELECT text FROM messages WHERE user_id = :user_id AND conversation_id IS NULL ORDER BY id LIMIT 1"),
                {"user_id": user_id},
            ).scalar()
            title = (first_message or "Previous chat").strip()[:60] or "Previous chat"
            result = connection.execute(
                text("INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES (:user_id, :title, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
                {"user_id": user_id, "title": title},
            )
            conversation_id = result.lastrowid
            connection.execute(
                text("UPDATE messages SET conversation_id = :conversation_id WHERE user_id = :user_id AND conversation_id IS NULL"),
                {"conversation_id": conversation_id, "user_id": user_id},
            )

ensure_schema()
