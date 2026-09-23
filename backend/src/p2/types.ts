// Ek finished session jo archive hone ke liye queue mein wait kar raha hai.
export interface PendingArchiveSession {
  id: string;
  sessionId: string;
  // Tencent Chat account IDs (User.userId), not database User.id UUIDs.
  initiatorUserId: string;
  receiverUserId: string;
  // Database UUIDs are retained only for SessionAuditLog foreign-key metadata.
  initiatorDbId: string;
  receiverDbId: string;
  startedAt: Date;
  endedAt: Date;
}

// Same conversation pair ke sessions ko ek Tencent history request mein group karta hai.
export interface ConversationGroup {
  conversationKey: string; // Example: "C2C_user1_user2"
  sessions: PendingArchiveSession[];
  minTime: number; // Earliest session start, Unix seconds
  maxTime: number; // Latest session end, Unix seconds
}

// Ek archive batch process hone ke baad ka summary result.
export interface ArchiveResult {
  success: boolean;
  processedCount: number;
  errors: Array<{ sessionId: string; error: string }>;
}
