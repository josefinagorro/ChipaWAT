import type { NextFunction, Request, Response } from "express";
import { supabase } from "./supabase.js";

export type AuthenticatedRequest = Request & {
  userId?: string;
  userEmail?: string;
};

/**
 * Exige que la request traiga el access token de Supabase en el header:
 *   Authorization: Bearer <access_token>
 * Ese token es el que el frontend obtiene de supabase.auth.getSession()
 * después de hacer login. Acá lo validamos contra Supabase Auth y, si es
 * válido, dejamos el userId disponible para el resto de la ruta.
 */
export async function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    response.status(401).json({ message: "Falta el token de autenticación." });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    response.status(401).json({ message: "Sesión inválida o vencida." });
    return;
  }

  request.userId = data.user.id;
  request.userEmail = data.user.email ?? undefined;
  next();
}
