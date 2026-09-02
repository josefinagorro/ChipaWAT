import { ArrowLeft, KeyRound, LogOut, Mail, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import "./account.css";

const COLORS = ["#d36a97", "#e0797a", "#e8a04a", "#7ea86a", "#2f6f5e", "#5b8fb9", "#8a6fb0", "#8a6a5c"];

export function AccountPage({ onExit }: { onExit: () => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setSavingProfile(true);
    setProfileError(null);
    setProfileFeedback(null);

    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), color })
      .eq("id", user.id);

    if (error) {
      setProfileError(error.message);
    } else {
      await refreshProfile();
      setProfileFeedback("Listo, guardamos tus datos.");
    }

    setSavingProfile(false);
  };

  const handleChangeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSavingEmail(true);
    setEmailError(null);
    setEmailFeedback(null);

    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });

    if (error) {
      setEmailError(error.message);
    } else {
      setNewEmail("");
      setEmailFeedback(
        "Te mandamos un link de confirmación. El email nuevo recién queda activo cuando lo confirmes (puede pedirte confirmar también desde el email viejo).",
      );
    }

    setSavingEmail(false);
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setPasswordError(null);
    setPasswordFeedback(null);

    if (newPassword !== repeatPassword) {
      setPasswordError("Las dos contraseñas nuevas no coinciden.");
      return;
    }

    if (!user?.email) {
      setPasswordError("No pudimos identificar tu email para verificar la contraseña.");
      return;
    }

    setSavingPassword(true);

    // Antes de cambiarla, comprobamos que quien está sentada frente a la
    // compu sabe la contraseña actual (por si alguien dejó la sesión abierta).
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      setPasswordError("La contraseña actual no es correcta.");
      setSavingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordError(error.message);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setPasswordFeedback("Contraseña actualizada. Usá la nueva la próxima vez que entres.");
    }

    setSavingPassword(false);
  };

  return (
    <div className="account-shell">
      <div className="account-content">
        <header className="account-header">
          <div>
            <span className="account-eyebrow">Mi cuenta</span>
            <h1>{profile?.name ?? "Tu cuenta"}</h1>
            <p className="account-hint">{user?.email}</p>
          </div>
          <div className="account-header-actions">
            <button type="button" className="account-ghost-button" onClick={onExit}>
              <ArrowLeft size={15} />
              Volver a la app
            </button>
            <button type="button" className="account-ghost-button" onClick={() => void signOut()}>
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </div>
        </header>

        <section className="account-panel">
          <h2>
            <UserRound size={18} />
            Tus datos
          </h2>
          <p className="account-hint">Así te ven tus amigas dentro de los grupos.</p>

          <form className="account-form" onSubmit={handleSaveProfile}>
            <label>
              Nombre
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                required
              />
            </label>

            <div className="account-field">
              <span className="account-label">Tu color</span>
              <div className="account-swatches">
                {COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`account-swatch ${color === option ? "selected" : ""}`}
                    style={{ background: option }}
                    aria-label={`Elegir color ${option}`}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>
            </div>

            {profileError && <p className="account-error">{profileError}</p>}
            {profileFeedback && <p className="account-success">{profileFeedback}</p>}

            <button type="submit" className="account-primary-button" disabled={savingProfile}>
              {savingProfile ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </section>

        <section className="account-panel">
          <h2>
            <Mail size={18} />
            Cambiar email
          </h2>
          <p className="account-hint">
            Hoy entrás con <strong>{user?.email}</strong>. Si lo cambiás, vas a iniciar sesión con el nuevo.
          </p>

          <form className="account-form" onSubmit={handleChangeEmail}>
            <label>
              Email nuevo
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="tunuevo@email.com"
                required
              />
            </label>

            {emailError && <p className="account-error">{emailError}</p>}
            {emailFeedback && <p className="account-success">{emailFeedback}</p>}

            <button type="submit" className="account-primary-button" disabled={savingEmail}>
              {savingEmail ? "Enviando..." : "Cambiar email"}
            </button>
          </form>
        </section>

        <section className="account-panel">
          <h2>
            <KeyRound size={18} />
            Cambiar contraseña
          </h2>
          <p className="account-hint">Te pedimos la actual para asegurarnos de que sos vos.</p>

          <form className="account-form" onSubmit={handleChangePassword}>
            <label>
              Contraseña actual
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <div className="account-form-row">
              <label>
                Contraseña nueva
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label>
                Repetila
                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </div>

            {passwordError && <p className="account-error">{passwordError}</p>}
            {passwordFeedback && <p className="account-success">{passwordFeedback}</p>}

            <button type="submit" className="account-primary-button" disabled={savingPassword}>
              {savingPassword ? "Cambiando..." : "Cambiar contraseña"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
