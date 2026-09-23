import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  AdminAuthResponse,
  AdminMeResponse,
  AdminArchiveMessagesResponse,
  ChatTokenResponse,
  UsersResponse,
  MeResponse,
  User,
  ApiMessageResponse,
} from "../types/api";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Centralized Axios instance configured with HttpOnly cookie support
export const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Event target to broadcast auth events (e.g., on 401 Unauthorized)
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

// Request Interceptor: Reads token from localStorage if present (bearer fallback)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Catches 401 errors on protected routes and triggers event
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      const url = error.config?.url || "";
      if (!url.includes("/login") && !url.includes("/register") && !url.includes("/me")) {
        window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

// Typed API Functions
export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>("/login", data);
  return response.data;
};

export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>("/register", data);
  return response.data;
};

/** Dedicated administrator credentials are intentionally separate from regular user login. */
export const adminLogin = async (data: { username: string; password: string }): Promise<AdminAuthResponse> => {
  const response = await api.post<AdminAuthResponse>("/api/admin/login", data);
  return response.data;
};

/** Simple standalone admin registration; this never calls the regular User registration endpoint. */
export const adminRegister = async (data: {
  username: string;
  password: string;
  name: string;
}): Promise<AdminAuthResponse> => {
  const response = await api.post<AdminAuthResponse>("/api/admin/register", data);
  return response.data;
};

export const getAdminMe = async (): Promise<AdminMeResponse> => {
  const response = await api.get<AdminMeResponse>("/api/admin/me");
  return response.data;
};

export const getAdminSessionMessages = async (
  sessionId: string
): Promise<AdminArchiveMessagesResponse> => {
  const response = await api.get<AdminArchiveMessagesResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}/messages`
  );
  return response.data;
};

export const adminLogout = async (): Promise<void> => {
  localStorage.removeItem("token");
  await api.post<ApiMessageResponse>("/api/admin/logout");
};

export const getChatToken = async (): Promise<ChatTokenResponse> => {
  const response = await api.post<ChatTokenResponse>("/api/chat/token");
  return response.data;
};

export const getUsers = async (): Promise<User[]> => {
  const response = await api.get<UsersResponse>("/users");
  return response.data.users;
};

export const getMe = async (): Promise<User> => {
  const response = await api.get<MeResponse>("/me");
  return response.data.user;
};

export const logout = async (): Promise<void> => {
  localStorage.removeItem("token");
  await api.post<ApiMessageResponse>("/logout");
};

export interface AdminSessionMetadata {
  id: string;
  participants: string[];
  startTime: string;
  endTime: string | null;
  durationSecs: number;
  status: "Ended" | "Timeout" | "Active";
  archivedAt: string | null;
}

export interface AdminSessionsResponse {
  items: AdminSessionMetadata[];
  page: number;
  limit: number;
  total: number;
}

export interface AdminTimelineItem {
  id: string;
  title: string;
  time: string;
  color: "emerald" | "blue" | "rose" | "amber";
}

export const getAdminSessions = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  participantId?: string;
  durationMin?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminSessionsResponse> => {
  const response = await api.get<AdminSessionsResponse>("/api/admin/sessions", { params });
  return response.data;
};

export const getAdminSessionTimeline = async (sessionId: string): Promise<{ timeline: AdminTimelineItem[] }> => {
  const response = await api.get<{ timeline: AdminTimelineItem[] }>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}/timeline`
  );
  return response.data;
};

// Session Management Endpoints (User Requested API Functions)
export const inviteUser = async (targetUserId: string): Promise<{
  message: string;
  request?: any;
}> => {
  const response = await api.post<{
    message: string;
    request?: any;
  }>("/api/session/invite", { targetUserId });
  return response.data;
};

export const getSessionStatus = async (): Promise<import("../types/api").SessionStatusResponse> => {
  const response = await api.get<import("../types/api").SessionStatusResponse>("/api/session/status");
  return response.data;
};

export const respondToRequest = async (
  requestId: string,
  action: "ACCEPT" | "REJECT"
): Promise<{ message: string; sessionId?: string; partner?: { userId: string; name: string } }> => {
  const response = await api.post<{ message: string; sessionId?: string; partner?: { userId: string; name: string } }>(
    "/api/session/respond",
    { requestId, action }
  );
  return response.data;
};

export const endSession = async (sessionId?: string): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>("/api/session/end", { sessionId });
  return response.data;
};

// Send heartbeat to reset inactivity timer (called on each message sent/received)
export const sendHeartbeat = async (): Promise<void> => {
  try {
    await api.post("/api/session/heartbeat");
  } catch {
    // Heartbeat failure is non-fatal — silently ignore
  }
};

// Aliases for compatibility
export const sendSessionInvite = inviteUser;
export const respondToSessionInvite = respondToRequest;
export const endChatSession = endSession;

export const checkSessionState = async () => {
  try {
    const status = await getSessionStatus();
    return {
      activeSession: status.activeSession
        ? {
            id: status.activeSession.id,
            initiatorId: "",
            receiverId: "",
            startedAt: new Date().toISOString(),
            status: "ACTIVE",
            isReceiver: status.activeSession.isReceiver,
            partnerUser: {
              id: status.activeSession.id,
              firstName: status.activeSession.partner?.firstName,
              lastName: status.activeSession.partner?.lastName,
              userId: status.activeSession.partner?.userId,
            },
          }
        : null,
      incomingRequest: status.incomingRequests[0]
        ? {
            id: status.incomingRequests[0].id,
            senderId: status.incomingRequests[0].senderId,
            receiverId: status.incomingRequests[0].receiverId,
            status: status.incomingRequests[0].status,
            createdAt: status.incomingRequests[0].createdAt,
            sender: {
              id: status.incomingRequests[0].senderId,
              firstName: status.incomingRequests[0].sender.firstName,
              lastName: status.incomingRequests[0].sender.lastName,
              userId: status.incomingRequests[0].sender.userId,
            },
          }
        : null,
      allIncomingRequests: status.incomingRequests.map((req) => ({
        id: req.id,
        senderId: req.senderId,
        receiverId: req.receiverId,
        status: req.status,
        createdAt: req.createdAt,
        sender: {
          id: req.senderId,
          firstName: req.sender.firstName,
          lastName: req.sender.lastName,
          userId: req.sender.userId,
        },
      })),
      sentRequest: null,
    };
  } catch (e) {
    const response = await api.get<import("../types/api").SessionCheckResponse>("/api/session/check");
    return response.data;
  }
};

export const sendSessionMessage = async (sessionId: string, text: string) => {
  const response = await api.post<{ message: import("../types/api").SessionMessageData }>(
    "/api/session/messages",
    { sessionId, text }
  );
  return response.data.message;
};

export const getSessionMessages = async (sessionId: string) => {
  const response = await api.get<{ messages: import("../types/api").SessionMessageData[] }>(
    `/api/session/messages?sessionId=${encodeURIComponent(sessionId)}`
  );
  return response.data.messages;
};

export interface UploadResponse {
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  fileName?: string;
}

export const uploadFile = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<UploadResponse>("/api/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export default api;
