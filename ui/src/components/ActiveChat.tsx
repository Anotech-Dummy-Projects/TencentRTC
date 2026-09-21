import React, { useState, useEffect, useRef } from "react";

export interface MessageItem {
  id: string;
  sender: "agent" | "user";
  senderInitials?: string;
  senderName?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  snapshotUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  time: string;
  read?: boolean;
  messageType?: "text" | "image" | "video" | "file";
  isUploading?: boolean;
}

export interface ActiveChatProps {
  partnerName?: string;
  partnerRole?: string;
  partnerInitials?: string;
  ticketId?: string;
  isReceiver?: boolean; // STRICT RULE: only the receiver person has the option to end the chat!
  messages?: MessageItem[];
  onEndChat?: () => void;
  onSendMessage?: (text: string) => void;
}

export const ActiveChat: React.FC<ActiveChatProps> = ({
  partnerName = "Support Agent",
  partnerRole = "Active Session",
  partnerInitials = "SA",
  ticketId = "#SES-9482",
  isReceiver = true,
  messages: externalMessages,
  onEndChat,
  onSendMessage,
}) => {
  // Starts blank by default!
  const [internalMessages, setInternalMessages] = useState<MessageItem[]>([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;

  const [inputMessage, setInputMessage] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active session timer counting up from 00:00
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: trimmed,
      time: timeStr,
      read: true,
    };

    if (externalMessages === undefined) {
      setInternalMessages((prev) => [...prev, newMsg]);
    }
    setInputMessage("");

    if (onSendMessage) {
      onSendMessage(trimmed);
    }
  };

  const handleEndChatClick = () => {
    if (!isReceiver) {
      alert("Only the receiver person has the option to end the chat session.");
      return;
    }

    if (confirm("Are you sure you want to end this live support session?")) {
      setIsEnding(true);
      if (onEndChat) {
        onEndChat();
      }
    }
  };

  return (
    <div className="w-full flex-1 flex items-center justify-center p-4 md:p-8 bg-slate-100 min-h-[calc(100vh-2rem)] text-slate-800 antialiased">
      {/* Main chat application container */}
      <main
        className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col h-[750px] overflow-hidden"
        data-purpose="active-chat-window"
      >
        {/* BEGIN: ChatHeader */}
        <header
          className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0"
          data-purpose="chat-header"
        >
          {/* Left side: Partner info & status */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-base shadow-sm">
                {partnerInitials}
              </div>
              {/* Online indicator dot */}
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"
                title="Online"
              ></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 leading-none">
                  {partnerName}
                </h1>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {partnerRole}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                <span className="font-mono font-medium text-slate-600">{ticketId}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <i className="ph ph-clock text-slate-400"></i>
                  <span className="font-mono" id="session-timer">
                    {formatTimer(timerSeconds)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Right side: ONLY THE RECEIVER PERSON HAS THE OPTION TO END THE CHAT! */}
          <div className="flex items-center gap-3">
            {isReceiver ? (
              <button
                aria-label="Terminate chat session"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-colors duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 cursor-pointer"
                data-purpose="terminate-chat-button"
                id="btn-end-chat"
                onClick={handleEndChatClick}
                disabled={isEnding}
                type="button"
                title="Receiver termination control"
              >
                <i className="ph ph-phone-disconnect text-lg"></i>
                <span>{isEnding ? "Ending..." : "End Chat"}</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Active Call (Receiver controls end)</span>
              </div>
            )}
          </div>
        </header>
        {/* END: ChatHeader */}

        {/* BEGIN: ChatMessageFeed */}
        <section
          className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/60 chat-scrollbar"
          data-purpose="message-feed"
        >
          {/* Session notice info banner */}
          <div className="flex justify-center">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-200/80 text-slate-600 shadow-sm">
              Live conversation active • Encrypted
            </span>
          </div>

          {/* Blank start state when no messages yet */}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                <i className="ph ph-chat-circle-dots text-3xl"></i>
              </div>
              <p className="text-sm font-semibold text-slate-700">Conversation started</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                This chat is blank. Type a message below to send the first message to {partnerName}.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.sender === "agent") {
                return (
                  <div
                    key={msg.id}
                    className="flex items-start gap-3 max-w-[75%]"
                    data-purpose="sender-message-item"
                  >
                    {/* Partner mini avatar */}
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs shrink-0 shadow-xs">
                      {msg.senderInitials || partnerInitials}
                    </div>
                    <div>
                      <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-2xl rounded-tl-sm shadow-sm leading-relaxed text-sm">
                        <p>{msg.text}</p>
                      </div>
                      <span className="inline-block mt-1 text-[11px] text-slate-400 font-medium px-1">
                        {msg.time}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className="flex items-end justify-end gap-2 ml-auto max-w-[75%]"
                  data-purpose="receiver-message-item"
                >
                  <div className="flex flex-col items-end">
                    <div className="bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-sm leading-relaxed text-sm">
                      <p>{msg.text}</p>
                    </div>
                    {/* Timestamp & Delivered/Read indicator */}
                    <div className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-slate-400 font-medium">
                      <span>{msg.time}</span>
                      {msg.read && (
                        <i className="ph ph-checks text-indigo-600 text-sm" title="Read"></i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </section>
        {/* END: ChatMessageFeed */}

        {/* BEGIN: ChatInputBar */}
        <footer className="p-4 bg-white border-t border-slate-200" data-purpose="chat-composer">
          <form className="flex items-center gap-3" data-purpose="message-form" onSubmit={handleSend}>
            {/* Text Input wrapper with action icons inside */}
            <div className="relative flex-1 flex items-center">
              <input
                aria-label="Type your message"
                className="w-full pl-4 pr-20 py-3 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 placeholder-slate-400 transition-all text-slate-800"
                placeholder="Type your message here..."
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
              />
              {/* Attachment and Emoji icons */}
              <div className="absolute right-2.5 flex items-center gap-1">
                <button
                  aria-label="Attach file"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                  title="Attach file"
                  type="button"
                  onClick={() => alert("File attachment feature ready.")}
                >
                  <i className="ph ph-paperclip text-lg"></i>
                </button>
                <button
                  aria-label="Add emoji"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                  title="Add emoji"
                  type="button"
                  onClick={() => setInputMessage((prev) => prev + " 😊")}
                >
                  <i className="ph ph-smiley text-lg"></i>
                </button>
              </div>
            </div>

            {/* Circular Send Button */}
            <button
              aria-label="Send message"
              className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white flex items-center justify-center shadow-md hover:shadow-indigo-500/25 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
              title="Send message"
              type="submit"
            >
              <i className="ph ph-paper-plane-tilt text-xl font-bold ml-0.5"></i>
            </button>
          </form>
        </footer>
        {/* END: ChatInputBar */}
      </main>
    </div>
  );
};

export default ActiveChat;
