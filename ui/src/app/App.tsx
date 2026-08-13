import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu,
  Edit3,
  Plus,
  Mic,
  ArrowUp,
  Copy,
  ThumbsUp,
  Volume2,
  Share2,
  MoreHorizontal,
  LogOut,
  User,
  ChevronDown,
  Square,
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  Lock,
} from "lucide-react";

type Screen = "login" | "chat";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  streaming?: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  { id: "1", role: "user", content: "Hii" },
  { id: "2", role: "ai", content: "Hi! Kaise ho? Aaj kaisa hai?" },
  { id: "3", role: "user", content: "Me badiya hu tum batao" },
  {
    id: "4",
    role: "ai",
    content:
      "Chalo, main bataata hoon. Maine aaj bahut accha din bitaya. Aap kya kar rahe the? Kuch naya kya hua hai aapke saath?",
  },
  { id: "5", role: "user", content: "Kuch nhi hua" },
  {
    id: "6",
    role: "ai",
    content:
      "Wah, to thoda boring hai! Kya aap kuch naya seekhne ya karne ka sochte the? Ya phir kuch din ke liye plan banane ka sochte the?",
  },
];

const HISTORY_ITEMS = [
  { id: "1", title: "NOVA plans", time: "Today, 4:20 PM", active: true },
  { id: "2", title: "React help", time: "Today, 2:15 PM", active: false },
  { id: "3", title: "Career advice", time: "Yesterday", active: false },
  { id: "4", title: "Code review", time: "Yesterday", active: false },
  { id: "5", title: "Travel plans", time: "Mon, Jul 7", active: false },
];

const AI_REPLIES = [
  "Bahut acchi baat hai! Main aapki madad karne ke liye yahan hoon. Aap mujhse kuch bhi pooch sakte hain, main poori koshish karunga.",
  "Yeh sunkar accha laga! Kya aap mujhe aur detail mein bata sakte hain? Main aapki baat dhyan se sun raha hoon.",
  "Bilkul samjha! Aapke sawaal ka jawab dene ki main koshish karta hoon. Chalo saath milke sochte hain.",
  "Interesting! Main iske baare mein soch raha tha. Aap kya chahte hain ke hum is topic pe aur baat karein?",
];

// ─── Background ─────────────────────────────────────────────────────────────

function NovaBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(52,199,122,0.09) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-2/3"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 25% 110%, rgba(24,92,61,0.13) 0%, transparent 65%)",
        }}
      />
      <motion.div
        animate={{ opacity: [0.04, 0.07, 0.04] }}
        transition={{ repeat: Infinity, duration: 14, ease: "easeInOut" }}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 80% 60%, rgba(52,199,122,0.08) 0%, transparent 55%)",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="nova-blur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#nova-blur)" opacity="0.035">
          <path
            d="M-120,350 Q180,200 420,370 Q660,540 960,320"
            stroke="#34C77A"
            strokeWidth="70"
            fill="none"
          />
          <path
            d="M-60,550 Q240,380 510,500 Q730,610 970,470"
            stroke="#185C3D"
            strokeWidth="50"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
}

// ─── Glass Icon Button ───────────────────────────────────────────────────────

function GlassBtn({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        background: "rgba(14,30,22,0.72)",
        border: "1px solid rgba(113,225,161,0.18)",
        boxShadow:
          "0 4px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(138,240,187,0.08)",
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── User Bubble ─────────────────────────────────────────────────────────────

function UserBubble({
  content,
  isNew = false,
}: {
  content: string;
  isNew?: boolean;
}) {
  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 12, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex justify-end mb-5"
    >
      <div
        className="max-w-[78%] px-4 py-3 rounded-[24px] text-[16px] leading-relaxed relative"
        style={{
          background:
            "linear-gradient(148deg, rgba(26,78,54,0.9) 0%, rgba(14,42,30,0.92) 100%)",
          border: "1px solid rgba(92,218,153,0.22)",
          boxShadow:
            "0 8px 28px rgba(0,0,0,0.38), inset 0 1px 0 rgba(138,240,187,0.14)",
          color: "#F5F7F6",
        }}
      >
        {content}
        <span
          className="inline-block ml-1.5 align-middle"
          style={{ color: "#34C77A", fontSize: "9px", opacity: 0.65 }}
        >
          ✦
        </span>
      </div>
    </motion.div>
  );
}

// ─── Action Row ──────────────────────────────────────────────────────────────

function ActionRow() {
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const actions = [
    {
      icon: copied ? <Check size={14} /> : <Copy size={14} />,
      fn: handleCopy,
      active: copied,
    },
    { icon: <ThumbsUp size={14} />, fn: () => setLiked(!liked), active: liked },
    { icon: <Volume2 size={14} />, fn: () => {}, active: false },
    { icon: <Share2 size={14} />, fn: () => {}, active: false },
    { icon: <MoreHorizontal size={14} />, fn: () => {}, active: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="flex items-center gap-4 mb-5 mt-0.5"
    >
      {actions.map((a, i) => (
        <motion.button
          key={i}
          whileTap={{ scale: 0.88, y: -1 }}
          whileHover={{ scale: 1.1 }}
          onClick={a.fn}
          className="transition-colors duration-150"
          style={{ color: a.active ? "#34C77A" : "#68736D" }}
        >
          {a.icon}
        </motion.button>
      ))}
    </motion.div>
  );
}

// ─── AI Message ──────────────────────────────────────────────────────────────

function AIMessage({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const words = content.split(" ");
  const [wordCount, setWordCount] = useState(streaming ? 0 : words.length);
  const [done, setDone] = useState(!streaming);

  useEffect(() => {
    if (!streaming) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setWordCount(idx);
      if (idx >= words.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, 55);
    return () => clearInterval(interval);
  }, []);

  const displayed = words.slice(0, wordCount).join(" ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <p
        className="text-[17px] leading-[1.7] mb-2"
        style={{ color: "#F5F7F6" }}
      >
        {displayed}
        {streaming && !done && (
          <span className="inline-flex ml-1.5 items-center gap-[3px] align-middle">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{ background: "#34C77A" }}
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.1,
                  delay: i * 0.18,
                  ease: "easeInOut",
                }}
              />
            ))}
          </span>
        )}
      </p>
      {done && <ActionRow />}
    </motion.div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({
  onSend,
  isGenerating,
  onStop,
}: {
  onSend: (msg: string) => void;
  isGenerating: boolean;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
    if (textRef.current) textRef.current.style.height = "auto";
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <motion.div
      animate={{ y: focused ? -3 : 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-3 mb-4 rounded-[22px] px-4 pt-3 pb-3"
      style={{
        background: "rgba(11,21,16,0.88)",
        border: focused
          ? "1px solid rgba(88,218,149,0.55)"
          : "1px solid rgba(113,225,161,0.18)",
        boxShadow:
          "0 -4px 32px rgba(0,0,0,0.35), 0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(138,240,187,0.07)",
        backdropFilter: "blur(22px)",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      <textarea
        ref={textRef}
        rows={1}
        value={input}
        onChange={handleInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask anything"
        className="w-full bg-transparent outline-none resize-none text-[16px] leading-relaxed placeholder:text-[#4A5650] mb-2.5"
        style={{
          color: "#F5F7F6",
          fontFamily: "Inter, sans-serif",
          maxHeight: "120px",
          overflowY: "auto",
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.88 }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(52,199,122,0.12)",
              color: "#5CDA99",
            }}
          >
            <Plus size={16} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-medium"
            style={{
              background: "rgba(14,30,22,0.7)",
              border: "1px solid rgba(113,225,161,0.18)",
              color: "#9EAAA4",
            }}
          >
            <span style={{ fontSize: "11px" }}>⚙</span>
            Llama 3 8B
            <ChevronDown size={11} />
          </motion.button>
        </div>
        <div className="flex items-center gap-2.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            style={{ color: "#68736D" }}
          >
            <Mic size={18} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92, y: 1 }}
            onClick={isGenerating ? onStop : handleSend}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: isGenerating
                ? "rgba(220,60,60,0.18)"
                : "linear-gradient(148deg, #34C77A 0%, #1A8C52 100%)",
              boxShadow: isGenerating
                ? "none"
                : "0 4px 14px rgba(52,199,122,0.22), inset 0 1px 0 rgba(255,255,255,0.18)",
              color: isGenerating ? "#ff6060" : "#fff",
              transition: "background 0.25s, box-shadow 0.25s",
            }}
          >
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.span
                  key="stop"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Square size={13} />
                </motion.span>
              ) : (
                <motion.span
                  key="send"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ArrowUp size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Chat Header ─────────────────────────────────────────────────────────────

function ChatHeader({
  onMenu,
  onNew,
}: {
  onMenu: () => void;
  onNew: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 pt-3 pb-3 relative z-10"
      style={{ borderBottom: "1px solid rgba(113,225,161,0.06)" }}
    >
      <GlassBtn onClick={onMenu}>
        <Menu size={18} style={{ color: "#9EAAA4" }} />
      </GlassBtn>
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="text-[20px] font-semibold"
            style={{
              color: "#F5F7F6",
              letterSpacing: "-0.025em",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Nova
          </span>
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: "#34C77A",
              boxShadow: "0 0 8px rgba(52,199,122,0.8)",
            }}
          />
        </div>
        <span className="text-[12px]" style={{ color: "#68736D" }}>
          Always here to help
        </span>
      </div>
      <GlassBtn onClick={onNew}>
        <Edit3 size={15} style={{ color: "#9EAAA4" }} />
      </GlassBtn>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  open,
  onClose,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 z-20"
            style={{
              background: "rgba(2,5,4,0.65)",
              backdropFilter: "blur(3px)",
            }}
            onClick={onClose}
          />
          <motion.div
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-0 bottom-0 z-30 flex flex-col"
            style={{
              width: "88%",
              background: "rgba(6,13,10,0.97)",
              borderRight: "1px solid rgba(113,225,161,0.1)",
              boxShadow: "6px 0 48px rgba(0,0,0,0.65)",
              backdropFilter: "blur(24px)",
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(138,240,187,0.18), transparent)",
              }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 w-px"
              style={{
                background:
                  "linear-gradient(180deg, transparent, rgba(52,199,122,0.08) 30%, rgba(52,199,122,0.04) 70%, transparent)",
              }}
            />

            {/* Brand + close */}
            <div className="px-5 pt-12 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="text-[22px] font-bold tracking-tight"
                  style={{
                    color: "#F5F7F6",
                    letterSpacing: "-0.03em",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  NOVA
                </span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#34C77A" }}
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                style={{ color: "#68736D" }}
              >
                <X size={20} />
              </motion.button>
            </div>

            {/* New Chat */}
            <div className="px-4 mb-5">
              <motion.button
                whileTap={{ scale: 0.97, y: 1 }}
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[16px] text-left"
                style={{
                  background: "rgba(14,30,22,0.75)",
                  border: "1px solid rgba(52,199,122,0.22)",
                  boxShadow:
                    "0 4px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(138,240,187,0.08)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(52,199,122,0.15)" }}
                >
                  <Plus size={17} style={{ color: "#34C77A" }} />
                </div>
                <div>
                  <div
                    className="text-[15px] font-semibold"
                    style={{ color: "#F5F7F6" }}
                  >
                    New chat
                  </div>
                  <div className="text-[12px]" style={{ color: "#68736D" }}>
                    Start a fresh conversation
                  </div>
                </div>
              </motion.button>
            </div>

            {/* History label */}
            <div className="px-5 mb-2">
              <span
                className="text-[11px] font-semibold tracking-[0.12em]"
                style={{ color: "#4A5650" }}
              >
                RECENT CHATS
              </span>
            </div>

            {/* History list */}
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {HISTORY_ITEMS.map((item) => (
                <motion.button
                  key={item.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={onClose}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[13px] mb-0.5 text-left"
                  style={{
                    background: item.active
                      ? "rgba(52,199,122,0.08)"
                      : "transparent",
                    borderLeft: item.active
                      ? "2px solid rgba(52,199,122,0.45)"
                      : "2px solid transparent",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                    style={{
                      background: item.active
                        ? "rgba(52,199,122,0.18)"
                        : "rgba(14,30,22,0.6)",
                      color: item.active ? "#34C77A" : "#68736D",
                    }}
                  >
                    N
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[14px] font-medium truncate"
                      style={{
                        color: item.active ? "#F5F7F6" : "#9EAAA4",
                      }}
                    >
                      {item.title}
                    </div>
                    <div className="text-[12px]" style={{ color: "#68736D" }}>
                      {item.time}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Profile */}
            <div
              className="px-4 pb-10 pt-3"
              style={{ borderTop: "1px solid rgba(113,225,161,0.06)" }}
            >
              <div
                className="flex items-center gap-3 px-3 py-3 rounded-[13px]"
                style={{
                  background: "rgba(14,30,22,0.5)",
                  border: "1px solid rgba(113,225,161,0.09)",
                  boxShadow:
                    "0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(138,240,187,0.04)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(52,199,122,0.14)",
                    color: "#34C77A",
                  }}
                >
                  <User size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: "#F5F7F6" }}
                  >
                    Admin
                  </div>
                  <div
                    className="text-[12px] truncate"
                    style={{ color: "#68736D" }}
                  >
                    admin@gmail.com
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  style={{ color: "#68736D" }}
                >
                  <LogOut size={16} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Chat Screen ─────────────────────────────────────────────────────────────

function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyIndex = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    (text: string) => {
      if (isGenerating) return;
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsGenerating(true);

      setTimeout(() => {
        const reply = AI_REPLIES[replyIndex.current % AI_REPLIES.length];
        replyIndex.current++;
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: reply,
          streaming: true,
        };
        setMessages((prev) => [...prev, aiMsg]);
        const streamDuration = reply.split(" ").length * 55 + 300;
        setTimeout(() => {
          setIsGenerating(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id ? { ...m, streaming: false } : m
            )
          );
        }, streamDuration);
      }, 700);
    },
    [isGenerating]
  );

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <NovaBackground />
      <ChatHeader
        onMenu={() => setSidebarOpen(true)}
        onNew={() => setMessages([])}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 relative z-10 pb-2">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) =>
            msg.role === "user" ? (
              <UserBubble
                key={msg.id}
                content={msg.content}
                isNew={idx >= INITIAL_MESSAGES.length}
              />
            ) : (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                <AIMessage content={msg.content} streaming={msg.streaming} />
              </motion.div>
            )
          )}
        </AnimatePresence>
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-3 pb-20"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(52,199,122,0.1)",
                border: "1px solid rgba(52,199,122,0.2)",
              }}
            >
              <span
                style={{
                  color: "#34C77A",
                  fontSize: "26px",
                  fontFamily: "Inter",
                  fontWeight: 700,
                }}
              >
                N
              </span>
            </div>
            <p
              className="text-[17px] font-medium"
              style={{ color: "#9EAAA4" }}
            >
              How can I help you today?
            </p>
            <p className="text-[14px]" style={{ color: "#4A5650" }}>
              Ask me anything...
            </p>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="relative z-10">
        <Composer
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={() => setIsGenerating(false)}
        />
      </div>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => setMessages([])}
      />
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  const handleLogin = () => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      setSuccess(true);
      setTimeout(() => onLogin(), 700);
    }, 1100);
  };

  const fieldStyle = (name: "email" | "password") => ({
    background:
      focused === name ? "rgba(12,24,18,0.92)" : "rgba(8,16,12,0.75)",
    border:
      focused === name
        ? "1px solid rgba(88,218,149,0.55)"
        : "1px solid rgba(113,225,161,0.1)",
    boxShadow:
      focused === name
        ? "inset 0 2px 5px rgba(0,0,0,0.35), 0 0 0 3px rgba(52,199,122,0.06)"
        : "inset 0 2px 5px rgba(0,0,0,0.3)",
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
  });

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <NovaBackground />

      {/* Slow ambient pulse */}
      <motion.div
        animate={{ opacity: [0.04, 0.09, 0.04], scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 13, ease: "easeInOut" }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 65% 35%, rgba(52,199,122,0.14) 0%, transparent 55%)",
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-center gap-2.5 mb-10"
        >
          <span
            className="text-[28px] font-bold"
            style={{
              color: "#F5F7F6",
              letterSpacing: "-0.035em",
              fontFamily: "Inter, sans-serif",
            }}
          >
            NOVA
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: "#34C77A",
              boxShadow: "0 0 10px rgba(52,199,122,0.9)",
            }}
          />
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="text-center mb-8"
        >
          <h1
            className="text-[32px] font-bold mb-1.5"
            style={{
              color: "#F5F7F6",
              letterSpacing: "-0.03em",
              fontFamily: "Inter, sans-serif",
            }}
          >
            WELCOME BACK
          </h1>
          <p className="text-[17px] mb-1.5" style={{ color: "#9EAAA4" }}>
            Sign in to NOVA
          </p>
          <p
            className="text-[13px] max-w-[270px] mx-auto leading-relaxed"
            style={{ color: "#68736D" }}
          >
            Continue your AI workspace with fast, intelligent conversations.
          </p>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.14, ease: "easeOut" }}
          className="w-full max-w-sm rounded-[28px] p-6"
          style={{
            background: "rgba(12,22,17,0.6)",
            border: "1px solid rgba(113,225,161,0.1)",
            boxShadow:
              "0 28px 72px rgba(0,0,0,0.45), inset 0 1px 0 rgba(138,240,187,0.06)",
            backdropFilter: "blur(22px)",
          }}
        >
          {/* Email */}
          <div className="mb-4">
            <div
              className="flex items-center gap-3 px-4 py-3.5 rounded-[14px]"
              style={fieldStyle("email")}
            >
              <Mail
                size={15}
                style={{
                  color: focused === "email" ? "#34C77A" : "#68736D",
                  flexShrink: 0,
                  transition: "color 0.2s",
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                placeholder="you@example.com"
                className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#4A5650]"
                style={{ color: "#F5F7F6", fontFamily: "Inter, sans-serif" }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-6">
            <div
              className="flex items-center gap-3 px-4 py-3.5 rounded-[14px]"
              style={fieldStyle("password")}
            >
              <Lock
                size={15}
                style={{
                  color: focused === "password" ? "#34C77A" : "#68736D",
                  flexShrink: 0,
                  transition: "color 0.2s",
                }}
              />
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                placeholder="Enter your password"
                className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#4A5650]"
                style={{ color: "#F5F7F6", fontFamily: "Inter, sans-serif" }}
              />
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setShowPass(!showPass)}
                style={{ color: "#68736D" }}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </motion.button>
            </div>
          </div>

          {/* Login button */}
          <motion.button
            whileTap={{ scale: 0.97, y: 1.5 }}
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-4 rounded-[14px] text-[15px] font-semibold mb-3 flex items-center justify-center"
            style={{
              background: "linear-gradient(148deg, #34C77A 0%, #1C8A52 100%)",
              boxShadow:
                "0 6px 22px rgba(52,199,122,0.22), inset 0 1px 0 rgba(255,255,255,0.18)",
              color: "#fff",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <AnimatePresence mode="wait">
              {loading ? (
                success ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 350 }}
                  >
                    <Check size={19} />
                  </motion.span>
                ) : (
                  <motion.div
                    key="spin"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, rotate: 360 }}
                    transition={{
                      opacity: { duration: 0.15 },
                      rotate: { repeat: Infinity, duration: 0.75, ease: "linear" },
                    }}
                    className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white"
                  />
                )
              ) : (
                <motion.span
                  key="label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Login
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Create account */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-[14px] text-[15px] font-medium"
            style={{
              background: "rgba(14,30,22,0.45)",
              border: "1px solid rgba(113,225,161,0.15)",
              color: "#9EAAA4",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Create an account
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#020504", fontFamily: "Inter, sans-serif" }}
    >
      <div
        className="relative overflow-hidden w-full"
        style={{
          maxWidth: "390px",
          height: "100dvh",
          maxHeight: "844px",
          background: "#050A08",
        }}
      >
        <AnimatePresence mode="wait">
          {screen === "login" ? (
            <motion.div
              key="login"
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, y: -16 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <LoginScreen onLogin={() => setScreen("chat")} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.03, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <ChatScreen />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
