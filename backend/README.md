# User Authentication Backend

A simple backend providing User Registration and Login modules.

- **Port**: `3000`
- **Database**: PostgreSQL (Neon) via Prisma
- **Auth**: Passwords hashed with Argon2, single JWT token issued on register/login

## Setup

```bash
npm install
npm run dev
```

## Endpoints

| Method | Path        | Description       | Body                     | Response |
| ------ | ----------- | ----------------- | ------------------------ | -------- |
| `POST` | `/register` | Register new user | `{ email, password }`    | `message`, `user`, `token` |
| `POST` | `/login`    | Login user        | `{ email, password }`    | `message`, `user`, `token` |

See `requests.http` for sample requests.

