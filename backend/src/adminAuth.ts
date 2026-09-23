import bcrypt from "bcryptjs";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

interface AdminTokenPayload {
  adminId: string;
  username: string;
  role: "ADMIN";
  tokenType: "ADMIN";
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET environment variable");
  return secret;
}

function readAdminToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.AdminToken as string | undefined;
  if (cookieToken) return cookieToken;

  const authorization = req.headers.authorization;
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" ? token : authorization;
}

/** Requires a token issued by this dedicated Admin auth route and an active Admin record. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readAdminToken(req);
    if (!token) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    const payload = jwt.verify(token, getJwtSecret()) as Partial<AdminTokenPayload>;
    if (
      payload.role !== "ADMIN" ||
      payload.tokenType !== "ADMIN" ||
      typeof payload.adminId !== "string" ||
      typeof payload.username !== "string"
    ) {
      res.status(403).json({ error: "Dedicated admin token required" });
      return;
    }

    // Check DB state every request so a disabled administrator loses access immediately.
    const admin = await prisma.admin.findUnique({
      where: { id: payload.adminId },
      select: { id: true, username: true, isActive: true },
    });
    if (!admin || !admin.isActive || admin.username !== payload.username) {
      res.status(403).json({ error: "Admin account is inactive or unavailable" });
      return;
    }

    req.admin = {
      adminId: admin.id,
      username: admin.username,
      role: "ADMIN",
      tokenType: "ADMIN",
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Invalid or expired admin token" });
      return;
    }
    next(error);
  }
}

const adminAuthRouter = Router();

function issueAdminToken(admin: { id: string; username: string }): string {
  const tokenPayload: AdminTokenPayload = {
    adminId: admin.id,
    username: admin.username,
    role: "ADMIN",
    tokenType: "ADMIN",
  };
  return jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: "24h" });
}

function setAdminCookie(res: Response, token: string): void {
  res.cookie("AdminToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin",
    maxAge: 24 * 60 * 60 * 1000,
  });
}

/** Simple dedicated-admin registration. This creates Admin records only, never regular User records. */
adminAuthRouter.post("/register", async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existingAdmin = await prisma.admin.findUnique({ where: { username } });
    if (existingAdmin) return res.status(409).json({ error: "Administrator username already exists" });

    const admin = await prisma.admin.create({
      data: {
        username,
        password: await bcrypt.hash(password, 10),
        name: name || null,
        isActive: true,
      },
    });
    const token = issueAdminToken(admin);
    setAdminCookie(res, token);
    return res.status(201).json({
      token,
      admin: { id: admin.id, username: admin.username, name: admin.name },
    });
  } catch (error) {
    console.error("[Admin Auth] Registration failed:", error);
    return res.status(500).json({ error: "Administrator registration failed" });
  }
});

/** Dedicated administrator login; regular User credentials are never queried here. */
adminAuthRouter.post("/login", async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin || !admin.isActive || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: "Invalid administrator credentials" });
    }

    const token = issueAdminToken(admin);
    const now = new Date();

    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: now } });
    await prisma.adminActivityLog.create({
      data: {
        adminId: admin.id,
        action: "LOGIN",
        ipAddr: req.ip,
        userAgent: req.get("user-agent") || null,
      },
    });

    setAdminCookie(res, token);
    return res.json({
      token,
      admin: { id: admin.id, username: admin.username, name: admin.name },
    });
  } catch (error) {
    console.error("[Admin Auth] Login failed:", error);
    return res.status(500).json({ error: "Administrator login failed" });
  }
});

/** Lets the dashboard validate an existing dedicated-admin token. */
adminAuthRouter.get("/me", requireAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.admin!.adminId },
    select: { id: true, username: true, name: true, lastLoginAt: true },
  });

  if (!admin) return res.status(404).json({ error: "Administrator not found" });
  return res.json({ admin });
});

/** Clears only the dedicated admin cookie; regular user authentication is untouched. */
adminAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie("AdminToken", { httpOnly: true, path: "/api/admin" });
  return res.json({ message: "Administrator logged out" });
});

export default adminAuthRouter;
