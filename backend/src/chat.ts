import { Router } from "express";
import jwt from "jsonwebtoken";
import TLSSigAPIv2 from "tls-sig-api-v2-typescript";

export interface JwtUserPayload {
  id: string;
  email: string;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

// Middleware to verify JWT (checks HttpOnly cookie first, then Authorization header)
export const authenticateJWT = (req: any, res: any, next: any) => {
  let token: string | undefined = req.cookies?.CookieToken;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    } else if (parts.length === 1) {
      token = parts[0];
    }
  }

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_secret"
    ) as JwtUserPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Initialize the TRTC API with your credentials from .env
const SDK_APP_ID = Number(process.env.TRTC_SDK_APP_ID);
const SECRET_KEY = process.env.TRTC_SECRET_KEY || "";

if (!SDK_APP_ID || !SECRET_KEY) {
  console.error("Missing TRTC credentials in environment variables");
}

const api = new TLSSigAPIv2.Api(SDK_APP_ID, SECRET_KEY);

export const chatRouter = Router();

chatRouter.post("/token", authenticateJWT, async (req, res) => {
  try {
    // The userId should match the one used in your Postgres DB
    // We use the email or a unique ID from the JWT
    const userId = req.user?.userId; 
    if (!userId) {
      return res.status(400).json({ error: "User ID not found in token" });
    }
    const expireTime = 86400 * 180; // Token valid for 180 days

    // Generate the UserSig
    const userSig = api.genUserSig(userId, expireTime);

    return res.json({
      sdkAppId: SDK_APP_ID,
      userId: userId,
      userSig: userSig,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to generate token" });
  }
});