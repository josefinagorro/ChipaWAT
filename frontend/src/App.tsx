import { LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountPage } from "./features/account/AccountPage";
import { GroupsPage } from "./features/groups/GroupsPage";
import { JoinInvitePage } from "./features/groups/JoinInvitePage";
import { AdminPanel } from "./features/admin/AdminPanel";
import { AuthPage } from "./features/auth/AuthPage";
import { useAuth } from "./features/auth/AuthContext";
import { CalendarModule } from "./features/calendar/CalendarModule";
import { ExpenseModuleV2 } from "./features/expenses/ExpenseModuleV2";
import { ShoppingModule } from "./features/shopping/ShoppingModule";
import { isSupabaseConfigured } from "./lib/supabaseClient";

function sectionFromHash(): string {
  if (window.location.hash === "#calendario") return "calendar";
  if (window.location.hash === "#super") return "shopping";
  if (window.location.hash === "#admin") return "admin";
  if (window.location.hash === "#cuenta") return "account";
  if (window.location.hash === "#grupos") return "groups";
  if (window.location.hash.startsWith("#invitacion=")) return "invite";
  return "expenses";
}

/** Saca el código de un link de invitación: #invitacion=abc123 */
function inviteCodeFromHash(): string | null {
  const match = window.location.hash.match(/^#invitacion=([a-z0-9]+)$/i);
  return match ? match[1] : null;
}

function MissingConfigScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">CW</div>
          <div>
            <p>ChipaWAT</p>
            <span>Falta un pasito de configuración</span>
          </div>
        </div>
        <p className="auth-error">
          No encuentro las variables de Supabase. Creá el archivo <strong>frontend/.env</strong> (copiá
          <strong> frontend/.env.example</strong>) con <strong>VITE_SUPABASE_URL</strong> y{" "}
          <strong>VITE_SUPABASE_ANON_KEY</strong>, y después reiniciá <strong>npm run dev</strong>.
        </p>
        <p className="auth-hint">
          Los dos valores están en el panel de Supabase: Settings → API. Usá la anon / public key, no la secret.
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">CW</div>
          <div>
            <p>ChipaWAT</p>
            <span>Cargando tu sesión...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const { session, profile, loading, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState(sectionFromHash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(sectionFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem("sidebar-collapsed", String(!current));
      return !current;
    });
  };

  if (!isSupabaseConfigured) {
    return <MissingConfigScreen />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  const inviteCode = inviteCodeFromHash();

  if (!session) {
    return (
      <AuthPage
        notice={
          inviteCode
            ? "Te invitaron a un grupo de ChipaWAT. Iniciá sesión o creá tu cuenta y te sumamos al grupo."
            : undefined
        }
      />
    );
  }

  if (activeSection === "invite" && inviteCode) {
    return (
      <JoinInvitePage
        code={inviteCode}
        onDone={() => {
          window.location.hash = "#grupos";
        }}
      />
    );
  }

  if (activeSection === "groups") {
    return (
      <GroupsPage
        onExit={() => {
          window.location.hash = "#gastos";
        }}
      />
    );
  }

  if (activeSection === "account") {
    return (
      <AccountPage
        onExit={() => {
          window.location.hash = "#gastos";
        }}
      />
    );
  }

  if (activeSection === "admin" && profile?.isAdmin) {
    return (
      <AdminPanel
        onExit={() => {
          window.location.hash = "#gastos";
        }}
      />
    );
  }

  const sidebarProps = {
    sidebarCollapsed,
    onSidebarToggle: toggleSidebar,
  };

  const floatingActions = (
    <div className="auth-floating">
      {profile?.isAdmin && (
        <button
          type="button"
          className="auth-logout"
          onClick={() => {
            window.location.hash = "#admin";
          }}
        >
          <ShieldCheck size={16} />
          Admin
        </button>
      )}
      <button type="button" className="auth-logout" onClick={() => void signOut()} title={profile?.name ?? "Cerrar sesión"}>
        <LogOut size={16} />
        {profile ? `Salir (${profile.name})` : "Salir"}
      </button>
    </div>
  );

  if (activeSection === "calendar") {
    return (
      <>
        {floatingActions}
        <CalendarModule {...sidebarProps} />
      </>
    );
  }

  if (activeSection === "shopping") {
    return (
      <>
        {floatingActions}
        <ShoppingModule {...sidebarProps} />
      </>
    );
  }

  return (
    <>
      {floatingActions}
      <ExpenseModuleV2 {...sidebarProps} />
    </>
  );
}
