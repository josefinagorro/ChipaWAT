import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import type { AuthMode } from "./types";
import "./auth.css";

function translateAuthError(message: string): string {
  const known: Record<string, string> = {
    "Invalid login credentials": "Email o contraseña incorrectos.",
    "User already registered": "Ya existe una cuenta con ese email. Probá iniciar sesión.",
    "Password should be at least 6 characters": "La contraseña tiene que tener al menos 6 caracteres.",
    "Email not confirmed": "Todavía no confirmaste tu email. Revisá tu bandeja de entrada.",
  };

  return known[message] ?? message;
}

export function AuthPage({ notice }: { notice?: string }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setConfirmationSent(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "sign-up") {
        const result = await signUp(email, password, name.trim());
        if (result.needsEmailConfirmation) {
          setConfirmationSent(true);
        }
      } else {
        await signIn(email, password);
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Algo salió mal, intentá de nuevo.";
      setError(translateAuthError(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">CW</div>
          <div>
            <p>ChipaWAT</p>
            <span>Casa, gastos y planes en un solo lugar</span>
          </div>
        </div>

        {notice && <p className="auth-notice">{notice}</p>}

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "sign-in" ? "active" : ""}`}
            onClick={() => switchMode("sign-in")}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "sign-up" ? "active" : ""}`}
            onClick={() => switchMode("sign-up")}
          >
            Crear cuenta
          </button>
        </div>

        {confirmationSent ? (
          <p className="auth-success">
            ¡Listo! Te mandamos un email para confirmar tu cuenta. Confirmalo y después iniciá sesión acá.
          </p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <label>
                Nombre
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como te dicen tus amigas"
                  required
                  minLength={2}
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vos@email.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
              {mode === "sign-up" && <span className="auth-hint">Mínimo 6 caracteres.</span>}
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? "Un segundo..." : mode === "sign-up" ? "Crear cuenta" : "Entrar"}
            </button>
          </form>
        )}

        <p className="auth-switch">
          {mode === "sign-in" ? (
            <>
              ¿Todavía no tenés cuenta? <button type="button" onClick={() => switchMode("sign-up")}>Creá una</button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta? <button type="button" onClick={() => switchMode("sign-in")}>Iniciá sesión</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
