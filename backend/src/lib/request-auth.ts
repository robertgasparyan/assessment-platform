import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthenticatedAdmin = {
  id: string;
  username: string;
};

declare global {
  namespace Express {
    interface Request {
      adminUser?: AuthenticatedAdmin;
    }
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function requireAdminAuth(request: Request, response: Response, next: NextFunction) {
  const token = getBearerToken(request);

  if (!token) {
    return response.status(401).json({ message: "Authentication required" });
  }

  const user = await prisma.adminUser.findFirst({
    where: {
      sessionToken: token,
      sessionExpiresAt: {
        gt: new Date()
      }
    }
  });

  if (!user) {
    return response.status(401).json({ message: "Session expired or invalid" });
  }

  request.adminUser = {
    id: user.id,
    username: user.username
  };

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      sessionExpiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });

  next();
}

export function buildSessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS);
}
