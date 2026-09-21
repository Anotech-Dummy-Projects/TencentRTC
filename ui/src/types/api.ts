export interface User {
  id: string;
  email: string;
  createdAt: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token?: string;
}

export interface ChatTokenResponse {
  sdkAppId: number;
  userId: string;
  userSig: string;
}

export interface UsersResponse {
  users: User[];
}

export interface MeResponse {
  user: User;
}

export interface ApiMessageResponse {
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

export interface SessionUserInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
  email?: string;
}

export interface ActiveSessionData {
  id: string;
  initiatorId: string;
  receiverId: string;
  startedAt: string;
  status: string;
  isReceiver: boolean;
  partnerUser: SessionUserInfo;
}

export interface IncomingRequestData {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  sender: SessionUserInfo;
}

export interface SessionCheckResponse {
  activeSession: ActiveSessionData | null;
  incomingRequest: IncomingRequestData | null;
  allIncomingRequests: IncomingRequestData[];
  sentRequest: {
    id: string;
    status: string;
    receiver: SessionUserInfo;
  } | null;
}

export interface SessionMessageData {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  text: string;
  time: string;
  createdAt: number;
}

export interface SessionPartner {
  firstName: string;
  lastName: string;
  userId: string;
}

export interface SessionStatusActiveSession {
  id: string;
  isReceiver: boolean;
  partner: SessionPartner | null;
}

export interface SessionStatusIncomingRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  sender: SessionPartner;
}

export interface SessionStatusResponse {
  activeSession: SessionStatusActiveSession | null;
  incomingRequests: SessionStatusIncomingRequest[];
}
