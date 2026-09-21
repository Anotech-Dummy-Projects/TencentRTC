import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./db.js";
import { authenticateJWT } from "./chat.js";
import { generateUserId } from "./utils/userIdGenerator.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const loginRouter = Router();

loginRouter.post(["/login", "/api/login"], async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: result.error.issues[0]?.message || "Validation failed",
        details: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Auto-generate and persist custom anonymous userId if missing
    let userUserId = user.userId;
    if (!userUserId || userUserId.trim() === "") {
      const emailPrefix = user.email.split("@")[0] || "User";
      const first = user.firstName || emailPrefix;
      const last = user.lastName || "Chat";
      userUserId = await generateUserId(first, last);
      await prisma.user.update({
        where: { id: user.id },
        data: { userId: userUserId },
      });
      user.userId = userUserId;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, userId: user.userId },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.cookie("CookieToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      message: "User logged in successfully",
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userId: user.userId,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

loginRouter.post(["/logout", "/api/logout"], (req, res) => {
  res.clearCookie("CookieToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res.json({ message: "Logged out successfully" });
});

loginRouter.get(["/me", "/api/me"], authenticateJWT, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Auto-generate and persist custom anonymous userId if missing
    if (!user.userId || user.userId.trim() === "") {
      const emailPrefix = user.email.split("@")[0] || "User";
      const first = user.firstName || emailPrefix;
      const last = user.lastName || "Chat";
      const generated = await generateUserId(first, last);
      await prisma.user.update({
        where: { id: user.id },
        data: { userId: generated },
      });
      user.userId = generated;
    }

    return res.json({ user });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

