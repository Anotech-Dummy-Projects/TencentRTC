# TencentRTC Ephemeral Chat-Logical Segmentation of Physical Conversation

A two-person, invitation-based chat app. The backend owns accounts, invite/session permissions, uploads, and session-state events; message delivery uses Tencent Cloud Chat directly between users.

> The project uses **Tencent Cloud Chat (IM)** for messaging. It does not currently create TRTC audio/video calls.

## Features

- Email/password registration and login; passwords are hashed with Argon2.
- JWT authentication using an HttpOnly `CookieToken` cookie, with a bearer-token fallback.
- Unique `@Chat` IDs for starting direct conversations.
- Invite, accept, reject, manual end, and inactivity timeout session flow.
- C2C text, image, video, and document messages using Tencent Cloud Chat.
- Typing start/stop signals, emoji picker, attachment upload, optimistic messages, and local conversation cleanup after a session ends.

## Architecture

```text
React / Vite UI
  ├── Axios HTTP ─────────► Express API ─────► PostgreSQL / Prisma
  │   auth, invites,               │
  │   sessions, uploads            ├── Tencent UserSig generation
  │                                └── Socket.io session events
  ├── Socket.io ◄──────────────────┘
  └── Tencent Cloud Chat SDK ◄─────► C2C messages and custom controls
```

| Location | Responsibility |
| --- | --- |
| `backend/src/session.ts` | Invitation and active-session lifecycle. |
| `backend/src/chat.ts` | JWT middleware and Tencent UserSig generation. |
| `backend/src/socketServer.ts` | Authenticated Socket.io private user rooms. |
| `backend/src/upload.ts` | Secure attachment validation and local storage. |
| `ui/src/App.tsx` | App orchestration, SDK sign-in, active session, and message state. |
| `ui/src/lib/api.ts` | Typed Axios calls to every REST endpoint. |
| `ui/src/lib/socket.ts` | Shared Socket.io client. |
| `ui/src/lib/trtcChat.ts` | Shared Tencent Cloud Chat SDK manager. |
| `ui/src/hooks/useSession.ts` | Session state, one-time hydration, and socket subscriptions. |
| `ui/src/components/ChatInterface.tsx` | Composer, attachments, typing UI, and emoji picker. |

## Technologies and approaches

| Area | Used technology/method | Purpose |
| --- | --- | --- |
| UI | React 19, TypeScript, Vite | Screen rendering and production build. |
| REST client | Axios | Cookie-enabled calls; response interceptor handles expired authentication. |
| Backend | Express 5 | API routes, middleware, static upload files. |
| Validation | Zod | Registration/login request validation. |
| Auth | Argon2, JSON Web Token, HttpOnly cookie | Secure password hashing and signed sessions. |
| Data | PostgreSQL and Prisma | Users, requests, and session metadata. Live messages are not stored here. |
| Session events | Socket.io | Immediate invite/session lifecycle updates. |
| Chat SDK | `@tencentcloud/chat` | C2C messages, media, and custom typing/control messages. |
| Tencent credential | `tls-sig-api-v2-typescript` | Backend-generated UserSig used by the chat SDK login. |
| Uploads | Multer | Attachment validation and local disk storage. |
| Emoji UI | `emoji-picker-react` | Searchable, category-based emoji selection. |

## Backend API methods

Protected routes accept the HttpOnly cookie first, then `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Body | Use |
| --- | --- | --- | --- | --- |
| `GET` | `/`, `/api/health` | No | — | Health check. |
| `POST` | `/register`, `/api/register` | No | `fullName?`, `firstName?`, `lastName?`, `email`, `password` | Validates, hashes the password, creates a unique ID, creates the user, and issues a JWT. `fullName` is split when separate names are absent. |
| `POST` | `/login`, `/api/login` | No | `email`, `password` | Verifies the Argon2 password hash and issues a JWT. |
| `POST` | `/logout`, `/api/logout` | No | — | Clears the auth cookie. |
| `GET` | `/me`, `/api/me` | Yes | — | Gets current user profile. |
| `GET` | `/users` | Yes | — | Gets user public details. |
| `POST` | `/api/chat/token` | Yes | — | Returns Tencent `{ sdkAppId, userId, userSig }`. |
| `POST` | `/api/session/invite` | Yes | `{ targetUserId }` | Creates/reuses a pending invite and emits `incoming_request`. |
| `GET` | `/api/session/status` | Yes | — | Gets active session plus incoming requests. |
| `POST` | `/api/session/respond` | Yes | `{ requestId, action }` | Accepts or rejects an invitation. |
| `POST` | `/api/session/end` | Yes | `{ sessionId? }` | Ends a session; only the receiver is authorized. |
| `POST` | `/api/session/heartbeat` | Yes | — | Refreshes active-session activity after sent/received messages. |
| `POST` | `/api/upload`, `/upload` | Yes | multipart `file` | Stores an allowed file and returns its public URL/metadata. |
| `GET` | `/uploads/:filename` | No | — | Serves uploaded files. |

### Upload support

- Images: JPEG, PNG, WebP, GIF; maximum **10 MB**.
- Video: MP4, WebM, MOV, OGG; maximum **10 MB**.
- Documents: PDF, Office documents, TXT, CSV, ZIP, RAR, 7Z; maximum **50 MB**.

## Frontend API methods

These typed methods are in `ui/src/lib/api.ts`.

| Method | Endpoint | Use |
| --- | --- | --- |
| `login(data)` | `POST /login` | Sign in. |
| `register(data)` | `POST /register` | Create an account. |
| `getMe()` | `GET /me` | Restore a cookie session at page load. |
| `logout()` | `POST /logout` | Sign out. |
| `getChatToken()` | `POST /api/chat/token` | Get Tencent SDK credentials. |
| `getUsers()` | `GET /users` | Retrieve available users. |
| `inviteUser(targetUserId)` | `POST /api/session/invite` | Invite the entered unique ID. |
| `getSessionStatus()` | `GET /api/session/status` | Initial session hydration and manual refresh. |
| `respondToRequest(requestId, action)` | `POST /api/session/respond` | Accept or reject. |
| `endSession(sessionId?)` | `POST /api/session/end` | End a session if authorized. |
| `sendHeartbeat()` | `POST /api/session/heartbeat` | Prevent inactivity cleanup after real message activity. |
| `uploadFile(file)` | `POST /api/upload` | Upload before sending a media message. |

`sendSessionInvite`, `respondToSessionInvite`, and `endChatSession` are compatibility aliases. `sendSessionMessage` and `getSessionMessages` are legacy helpers; their backend message routes are disabled because live chat now uses Tencent directly.

## Socket.io methods and events

The UI uses a singleton `socketClient` from `ui/src/lib/socket.ts`.

| Method/event | Direction | Use |
| --- | --- | --- |
| `socketClient.connect()` | UI → server | Opens a cookie-authenticated connection after login. |
| `socketClient.disconnect()` | UI → server | Closes the connection during logout/unauthorized state. |
| `socketClient.on(event, listener)` | Server → UI | Adds a typed listener and returns an unsubscribe function. Listeners registered before connection are buffered. |
| `incoming_request` | Server → recipient | A user has sent an invitation. |
| `request_rejected` | Server → sender | A recipient rejected an invitation. |
| `session_updated` | Server → both users | An invitation was accepted; session and partner data are supplied. |
| `session_ended` | Server → both users | A session ended manually or due to inactivity. |

On the server, `initSocketServer(httpServer)` validates each socket JWT and joins that user to a private room named by their database ID. `emitToUser(userId, event, data)` sends an event to that private room.

## Tencent Cloud Chat SDK usage

All Tencent calls are isolated in the `trtcChat` singleton at `ui/src/lib/trtcChat.ts`.

### Sign-in flow

1. `App.tsx` calls `getChatToken()` after the app user is available.
2. The backend calls `TLSSigAPIv2.Api.genUserSig(userId, 180 days)` with `TRTC_SDK_APP_ID` and `TRTC_SECRET_KEY`.
3. The UI calls `trtcChat.init(sdkAppId)`, which calls `TencentCloudChat.create({ SDKAppID })`.
4. The UI calls `trtcChat.login(userId, userSig)`, which calls `chatInstance.login({ userID, userSig })`.
5. The manager listens for `SDK_READY`, `SDK_NOT_READY`, and `MESSAGE_RECEIVED`.

### Manager methods used in this project

| `trtcChat` method | Tencent SDK method/event | Project use |
| --- | --- | --- |
| `init(sdkAppId)` | `TencentCloudChat.create`, `SDK_READY`, `SDK_NOT_READY`, `MESSAGE_RECEIVED` | Creates the client once and registers incoming message handling. |
| `login(userId, userSig)` | `chatInstance.login` | Authenticates the user with Tencent. |
| `logout()` | `chatInstance.logout` | Clears Tencent auth on sign-out. |
| `sendMessage(toUserId, text)` | `createTextMessage`, `sendMessage` | Sends C2C text. It first sends a stop-typing signal. |
| `sendMediaMessage(toUserId, file, type)` | `createImageMessage`, `createVideoMessage`, `createFileMessage`, `sendMessage` | Uploads locally first, then sends C2C media. If direct media sending fails, it sends a `MEDIA` custom payload with the uploaded URL. |
| `sendCustomMessage(toUserId, payload)` | `createCustomMessage`, `sendMessage` | Sends invisible control payloads and mirrors typing state via `BroadcastChannel` for same-browser tabs. |
| `sendTypingSignal(toUserId)` | Custom `TYPING_START` | Starts a debounced typing state, at most once every two seconds. |
| `stopTypingSignal(toUserId)` | Custom `TYPING_STOP` | Clears typing immediately after idle input, clearing input, or before delivery. |
| `onMessage(callback)` | Internal SDK listener subscription | `App.tsx` adds incoming messages to React state. |
| `onTyping(callback)` | Internal custom-message subscription | `ChatInterface.tsx` shows/hides typing only for the exact active partner ID. |
| `onCustomMessage(callback)` | Internal custom-message subscription | `App.tsx` processes non-typing controls such as `SESSION_ENDED`. |
| `destroyConversation(withUserId)` | `deleteConversation({ conversationID: "C2C" + userId })` | Deletes local Tencent history when a session ends or the user signs out. |

All real messages use `TencentCloudChat.TYPES.CONV_C2C` (direct user-to-user chat, not a group). The inbound handler supports `MSG_TEXT`, `MSG_IMAGE`, `MSG_VIDEO`, `MSG_FILE`, and `MSG_CUSTOM`.

## Session, typing, and emoji behavior

- Pending invites expire after **3 minutes**.
- Active sessions end after **3 minutes** without activity; backend cleanup runs every **60 seconds**.
- Sent/received real messages call the heartbeat endpoint.
- Input sends `TYPING_START`; after **1 second** with no keystroke, on clearing input, or before delivery, it sends `TYPING_STOP`.
- The receiver has a **2-second** fallback timer in case a stop signal is lost; a received partner message also clears the indicator.
- The smiley icon opens `emoji-picker-react`; selecting an emoji appends it to the input and closes the picker. Outside-click and Escape also close it.

## Environment setup

Create `backend/.env` and do not commit real credentials:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=replace-with-a-long-random-secret
TRTC_SDK_APP_ID=1234567890
TRTC_SECRET_KEY=replace-with-your-tencent-secret-key
CLIENT_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
NODE_ENV=development
```

Create `ui/.env` only if the API is not at the default local address:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Run locally

```bash
# Terminal 1
cd backend
npm install
npm run dev

# Terminal 2
cd ui
npm install
npm run dev
```

Build the frontend for production verification:

```bash
cd ui
npm run build
```

## End-to-end test checklist

1. Register two users and copy their unique IDs.
2. Sign in as user A and start a conversation with user B's ID.
3. Confirm user B receives the invitation without a refresh, then accept it.
4. Send text, emoji, image/video/document attachments in both directions.
5. Confirm typing starts and clears after one second, clearing input, and delivery.
6. End the chat from the receiver account; both users should return to the start screen.
7. Start another chat with the same users and confirm the old local conversation is not shown.


1️⃣ Step 1: Session End Hone Par (Backend Trigger)
Jab Ayush "End Conversation" click karta hai:
Backend POST /end handle karta hai → DB mein active_sessions.status = 'ENDED' update karta hai.
CRITICAL: Usi waqt DB ki pending_archives table mein ek nayi row insert hoti hai:

INSERT INTO pending_archives (session_id, status, created_at) 
VALUES ('sess_om_ayush_001', 'PENDING', NOW());

2️⃣ Step 2: Cron Job Archive Karta Hai (8 PM ya 70 Count)
Cron job trigger hone par:
pending_archives se sess_om_ayush_001 uthata hai.
DB se is session ka startedAt (09:00 AM) aur endedAt (09:06 AM) fetch karta hai.
Tencent se paginated fetch loop chalata hai (getMessageList + nextReqMessageID).
Har message ko locally filter karta hai: msg.time >= 09:00 && msg.time <= 09:06.
Filtered messages ko clean JSON format mein convert karta hai.
S3 par upload karta hai: s3://claritydesk-audit/2026/09/sess_om_ayush_001.json.
Upload successful? → pending_archives se row DELETE karta hai.
3️⃣ Step 3: Admin Click Karta Hai (On-Demand Fetch)
Jab Admin panel mein Om-Ayush session par click karta hai:
Frontend API call karta hai: GET /api/admin/sessions/sess_om_ayush_001.
Backend S3 se GetObject({Key: 'audit/2026/09/sess_om_ayush_001.json'}) karta hai.
Response directly frontend ko bhejta hai.
Frontend JSON parse karke chat bubbles render karta hai (exactly waise jaise user ne dekha tha).
💡 Key Points Yaad Rakhne Ke Liye
DB Sirf Metadata Rakhta Hai: startedAt, endedAt, participants. Chat content kabhi DB mein nahi jaati.
Tencent Sirf Raw Data Deta Hai: Filtering aur formatting hamara kaam hai.
S3 Permanent Archive Hai: Ek baar upload ho gaya, toh wohi source of truth hai admin ke liye.
Queue Crash-Safe Hai: Server restart hone par bhi pending_archives table safe rehti hai. Cron resume karega wahan se.


The 5 Core Methods (Backend Service)
1. enqueueSession(sessionId: string)
Trigger: Jab session end hoti hai (POST /end).
Kaam: PendingArchive table mein row insert karna { sessionId, status: 'PENDING' }.
Check: Insert ke baad turant count check karna. Agar count >= 35, toh processArchiveBatch() call karna.
Output: Void (Background trigger).
2. getUniqueConversationGroups(limit: number)
Trigger: processArchiveBatch() ke andar.
Kaam: DB se top 35 pending sessions uthana aur unhe initiatorId + receiverId key se group karna.
Logic: Map banega: { "C2C_Om_Ayush": [sess1, sess2], "C2C_Alex_Sam": [sess3] }.
Output: Array of unique conversation objects with their associated sessions.
3. fetchFullConversationHistory(conversationId, minTime, maxTime)
Trigger: Har unique conversation ke liye loop mein.
Kaam: Tencent REST API (admin_getroammsg) call karna.
Pagination Loop: Jab tak response Complete === 0 ho, tab tak LastMsgKey pass karke next page fetch karna.
Output: Full message array for that time range (RAM mein).
4. sliceAndUploadSessions(messages, sessions)
Trigger: Jab history fetch ho jaye.
Kaam:
Messages ko har session ke startedAt/endedAt se filter karna.
Filtered JSON ko AWS S3 par upload karna (PutObjectCommand).
Success hone par PendingArchive rows delete/update karna.
Parallelism: Is method ko batch of 3 conversations ke liye parallel chalana.
Output: Promise<void> (All uploads done).
5. cronForceProcess()
Trigger: Daily at 8:00 PM.
Kaam: Jo bhi sessions abhi tak pending hain (chahe count < 35 ho), unhe utha kar same processArchiveBatch() flow se process karna.
Safety Net: Ensure no data is left behind for the day.
Output: Void.


Env Vars: TRTC_SDK_APP_ID aur TRTC_SECRET_KEY use karega.
Dynamic UserSig: tls-sig-api-v2-node se admin user ka sig generate karega (180 days expiry).
Region URL: Singapore (adminapisgp.im.qcloud.com) hardcode karega.
Grouping Logic: Sorted user IDs se key banayega (no session ID).
Parallel Batching: 3 conversations at a time process karega.
