import { Router } from "express";
import { supabase } from "../lib/supabase.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json({
    status: "ok",
    service: "chipawat-api",
  });
});

healthRouter.get("/supabase", async (_request, response) => {
  const { error } = await supabase.storage.listBuckets();

  response.status(error ? 503 : 200).json({
    status: error ? "error" : "ok",
    service: "supabase",
    message: error?.message ?? "Supabase connection is ready.",
  });
});
