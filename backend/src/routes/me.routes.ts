import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";

export const meRouter = Router();

// Ruta de ejemplo: devuelve el perfil de quien esté logueada.
// Sirve para probar que el login end-to-end funciona (frontend -> backend).
meRouter.get("/", requireAuth, async (request: AuthenticatedRequest, response) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, color, is_admin")
    .eq("id", request.userId)
    .maybeSingle();

  if (error) {
    response.status(500).json({ message: error.message });
    return;
  }

  response.json({ profile: data, email: request.userEmail });
});
