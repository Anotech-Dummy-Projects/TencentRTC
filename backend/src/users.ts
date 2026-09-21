import { Router } from "express";
import { prisma } from "./db.js";
import { authenticateJWT } from "./chat.js";

export const usersRouter = Router();

// GET /users - Returns registered users for contacts list/chat
usersRouter.get("/users", authenticateJWT, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({ users });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});
