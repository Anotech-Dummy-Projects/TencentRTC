import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./db.js";
import { generateUserId } from "./utils/userIdGenerator.js";

const registerSchema = z.object({
  fullName: z.string().trim().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerRouter = Router();

registerRouter.post(["/register", "/api/register"], async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: result.error.issues[0]?.message || "Validation failed",
        details: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }

    const { fullName, email, password } = result.data;
    let { firstName, lastName } = result.data;

    // Parse names from fullName if firstName/lastName were not directly provided
    if (!firstName && fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] || "User";
      lastName = parts.slice(1).join(" ") || "Member";
    }

    firstName = (firstName && firstName.trim()) || "User";
    lastName = (lastName && lastName.trim()) || "Member";

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // Generate unique user ID with initial letters and random suffix
    const userId = await generateUserId(firstName, lastName);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        userId,
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, userId: user.userId },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.cookie("CookieToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // The frontend and API currently use separate Vercel subdomains.
      // Cross-origin XHR requests need an explicit cross-site cookie in production.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      message: "User registered successfully",
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
