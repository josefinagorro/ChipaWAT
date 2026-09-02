import { ArrowLeft, Check, Copy, DoorOpen, Link2, Plus, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  buildInviteLink,
  createGroup,
  createInvite,
  leaveGroup,
  listInvites,
  listMyGroups,
  revokeInvite,
} from "./groupsApi";
import type { GroupInvite, GroupRole, MyGroup } from "./types";
import "./groups.css";

const ROLE_LABELS: Record<GroupRole, string> = {
  owner: "Dueña",
  admin: "Admin",
  member: "Integrante",
};

const EXPIRY_OPTIONS: { id: string; label: string; days: number | null }[] = [
  { id: "7", label: "Vence en 7 días", days: 7 },
  { id: "30", label: "Vence en 30 días", days: 30 },
  { id: "never", label: "No vence", days: null },
];

function describeInvite(invite: GroupInvite): string {
  if (!invite.expiresAt) {
    return `${invite.usesCount} usos · no vence`;
  }

  const expiry = new Date(invite.expiresAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });

  return `${invite.usesCount} usos · vence ${expiry}`;
}

export function GroupsPage({ onExit }: { onExit: () => void }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setError(null);

    try {
      const [nextGroups, nextInvites] = await Promise.all([listMyGroups(user.id), listInvites()]);
      setGroups(nextGroups);
      setInvites(nextInvites);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar tus grupos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);

    try {
      await action();
      await loadAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    void runAction(async () => {
      await createGroup(name, newDescription.trim());
      setNewName("");
      setNewDescription("");
    });
  };

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(code));
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError("No pudimos copiar solos. Seleccioná el link con el mouse y copialo con Ctrl+C.");
    }
  };

  if (loading) {
    return (
      <div className="groups-shell">
        <p className="groups-loading">Cargando tus grupos...</p>
      </div>
    );
  }

  return (
    <div className="groups-shell">
      <div className="groups-content">
        <header className="groups-header">
          <div>
            <span className="groups-eyebrow">Mis grupos</span>
            <h1>Grupos</h1>
            <p className="groups-hint">
              Un grupo es una casa o un viaje compartido. Creá el tuyo y pasales el link a tus amigas.
            </p>
          </div>
          <button type="button" className="groups-ghost-button" onClick={onExit}>
            <ArrowLeft size={15} />
            Volver a la app
          </button>
        </header>

        {error && <p className="groups-error">{error}</p>}

        <section className="groups-panel">
          <h2>
            <Plus size={18} />
            Crear un grupo nuevo
          </h2>
          <p className="groups-hint">Vos quedás como dueña y podés invitar a quien quieras.</p>

          <form className="groups-create-form" onSubmit={handleCreateGroup}>
            <label>
              Nombre
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Casa de Wanaka"
                required
              />
            </label>
            <label>
              Descripción
              <input
                type="text"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Verano 2026, 4 meses"
              />
            </label>
            <button type="submit" className="groups-primary-button" disabled={busy}>
              Crear grupo
            </button>
          </form>
        </section>

        {groups.length === 0 && (
          <p className="groups-empty">
            Todavía no sos parte de ningún grupo. Creá uno acá arriba, o pedile el link a quien ya tenga uno armado.
          </p>
        )}

        {groups.map((group) => {
          const canInvite = group.myRole === "owner" || group.myRole === "admin";
          const groupInvites = invites.filter((invite) => invite.groupId === group.id);
          const selectedExpiry = expiryDraft[group.id] ?? "7";

          return (
            <section key={group.id} className="groups-panel">
              <div className="groups-card-head">
                <div>
                  <h2>
                    <UsersRound size={18} />
                    {group.name}
                  </h2>
                  {group.description && <p className="groups-hint">{group.description}</p>}
                </div>
                <span className="groups-role-pill">{ROLE_LABELS[group.myRole]}</span>
              </div>

              <div className="groups-members">
                {group.members.map((member) => (
                  <span key={member.userId} className="groups-member-chip">
                    <span className="groups-dot" style={{ background: member.color }} />
                    {member.name}
                    {member.role !== "member" && <em>{ROLE_LABELS[member.role]}</em>}
                  </span>
                ))}
              </div>

              {canInvite ? (
                <div className="groups-invite-area">
                  <div className="groups-invite-new">
                    <select
                      value={selectedExpiry}
                      onChange={(event) => setExpiryDraft({ ...expiryDraft, [group.id]: event.target.value })}
                    >
                      {EXPIRY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="groups-primary-button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(() =>
                          createInvite(
                            group.id,
                            EXPIRY_OPTIONS.find((option) => option.id === selectedExpiry)?.days ?? null,
                          ),
                        )
                      }
                    >
                      <Link2 size={16} />
                      Crear link de invitación
                    </button>
                  </div>

                  {groupInvites.map((invite) => (
                    <div key={invite.id} className="groups-invite-row">
                      <input type="text" readOnly value={buildInviteLink(invite.code)} onFocus={(event) => event.target.select()} />
                      <button type="button" className="groups-ghost-button" onClick={() => void copyLink(invite.code)}>
                        {copiedCode === invite.code ? <Check size={14} /> : <Copy size={14} />}
                        {copiedCode === invite.code ? "¡Copiado!" : "Copiar"}
                      </button>
                      <button
                        type="button"
                        className="groups-ghost-button"
                        disabled={busy}
                        onClick={() => void runAction(() => revokeInvite(invite.id))}
                        title="Dar de baja este link"
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="groups-invite-meta">{describeInvite(invite)}</span>
                    </div>
                  ))}

                  {groupInvites.length === 0 && (
                    <p className="groups-hint">Todavía no hay ningún link activo para este grupo.</p>
                  )}
                </div>
              ) : (
                <p className="groups-hint">Solo la dueña o una admin del grupo pueden generar invitaciones.</p>
              )}

              <div className="groups-card-footer">
                {pendingLeave === group.id ? (
                  <span className="groups-confirm">
                    ¿Salir de {group.name}?
                    <button
                      type="button"
                      className="groups-danger-button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await leaveGroup(group.id);
                          setPendingLeave(null);
                        })
                      }
                    >
                      Sí, salir
                    </button>
                    <button type="button" className="groups-ghost-button" onClick={() => setPendingLeave(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" className="groups-ghost-button" onClick={() => setPendingLeave(group.id)}>
                    <DoorOpen size={14} />
                    Salir del grupo
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
