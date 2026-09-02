import { ArrowLeft, Plus, RefreshCw, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  addMember,
  changeRole,
  createGroup,
  listGroups,
  listMemberships,
  listUsers,
  removeMember,
  setAdmin,
} from "./adminApi";
import type { AdminGroup, AdminMembership, AdminUser, GroupRole } from "./types";
import "./admin.css";

const ROLE_LABELS: Record<GroupRole, string> = {
  owner: "Dueña",
  admin: "Admin del grupo",
  member: "Integrante",
};

const ROLES: GroupRole[] = ["owner", "admin", "member"];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AdminPanel({ onExit }: { onExit: () => void }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [memberships, setMemberships] = useState<AdminMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [memberDraft, setMemberDraft] = useState<Record<string, string>>({});
  const [roleDraft, setRoleDraft] = useState<Record<string, GroupRole>>({});
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);

    try {
      const [nextUsers, nextGroups, nextMemberships] = await Promise.all([
        listUsers(),
        listGroups(),
        listMemberships(),
      ]);

      setUsers(nextUsers);
      setGroups(nextGroups);
      setMemberships(nextMemberships);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

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
    const name = newGroupName.trim();
    if (!name) return;

    void runAction(async () => {
      await createGroup(name, newGroupDescription.trim());
      setNewGroupName("");
      setNewGroupDescription("");
    });
  };

  if (loading) {
    return (
      <div className="admin-shell">
        <p className="admin-loading">Cargando el panel...</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <header className="admin-header">
          <div>
            <span className="admin-eyebrow">Panel de admin</span>
            <h1>Grupos y usuarias</h1>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="admin-ghost-button" onClick={() => void loadAll()} disabled={busy}>
              <RefreshCw size={15} />
              Actualizar
            </button>
            <button type="button" className="admin-ghost-button" onClick={onExit}>
              <ArrowLeft size={15} />
              Volver a la app
            </button>
          </div>
        </header>

        {error && <p className="admin-error">{error}</p>}

        <section className="admin-panel">
          <h2>Crear un grupo</h2>
          <p className="admin-hint">
            Un grupo es la casa o el viaje compartido. Quien lo crea queda como dueña automáticamente.
          </p>
          <form className="admin-create-form" onSubmit={handleCreateGroup}>
            <label>
              Nombre
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Casa de Wanaka"
                required
              />
            </label>
            <label>
              Descripción
              <input
                type="text"
                value={newGroupDescription}
                onChange={(event) => setNewGroupDescription(event.target.value)}
                placeholder="Verano 2026, 4 meses"
              />
            </label>
            <button type="submit" className="admin-primary-button" disabled={busy}>
              <Plus size={16} />
              Crear grupo
            </button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>Grupos ({groups.length})</h2>

          {groups.length === 0 && <p className="admin-empty">Todavía no hay ningún grupo. Creá el primero acá arriba.</p>}

          <div className="admin-group-list">
            {groups.map((group) => {
              const groupMembers = memberships.filter((membership) => membership.groupId === group.id);
              const availableUsers = users.filter(
                (user) => !groupMembers.some((membership) => membership.userId === user.id),
              );

              return (
                <article key={group.id} className="admin-group-card">
                  <div className="admin-group-head">
                    <div>
                      <h3>{group.name}</h3>
                      {group.description && <p className="admin-hint">{group.description}</p>}
                    </div>
                    <span className="admin-count-pill">{groupMembers.length} integrantes</span>
                  </div>

                  <ul className="admin-member-list">
                    {groupMembers.map((membership) => {
                      const user = usersById.get(membership.userId);
                      const removalKey = `${membership.groupId}:${membership.userId}`;

                      return (
                        <li key={removalKey} className="admin-member-row">
                          <span className="admin-member-name">
                            <span className="admin-dot" style={{ background: user?.color ?? "#d36a97" }} />
                            {user?.name ?? "Usuaria desconocida"}
                          </span>

                          <select
                            value={membership.role}
                            disabled={busy}
                            onChange={(event) =>
                              void runAction(() =>
                                changeRole(group.id, membership.userId, event.target.value as GroupRole),
                              )
                            }
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>

                          {pendingRemoval === removalKey ? (
                            <span className="admin-confirm">
                              ¿Sacarla?
                              <button
                                type="button"
                                className="admin-danger-button"
                                disabled={busy}
                                onClick={() =>
                                  void runAction(async () => {
                                    await removeMember(group.id, membership.userId);
                                    setPendingRemoval(null);
                                  })
                                }
                              >
                                Sí
                              </button>
                              <button type="button" className="admin-ghost-button" onClick={() => setPendingRemoval(null)}>
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="admin-ghost-button"
                              disabled={busy}
                              onClick={() => setPendingRemoval(removalKey)}
                            >
                              <UserMinus size={14} />
                              Sacar
                            </button>
                          )}
                        </li>
                      );
                    })}

                    {groupMembers.length === 0 && <li className="admin-empty">Este grupo todavía no tiene integrantes.</li>}
                  </ul>

                  {availableUsers.length > 0 ? (
                    <div className="admin-add-member">
                      <select
                        value={memberDraft[group.id] ?? ""}
                        onChange={(event) => setMemberDraft({ ...memberDraft, [group.id]: event.target.value })}
                      >
                        <option value="">Elegí a quién sumar...</option>
                        {availableUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} — {user.email}
                          </option>
                        ))}
                      </select>

                      <select
                        value={roleDraft[group.id] ?? "member"}
                        onChange={(event) => setRoleDraft({ ...roleDraft, [group.id]: event.target.value as GroupRole })}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="admin-primary-button"
                        disabled={busy || !memberDraft[group.id]}
                        onClick={() =>
                          void runAction(async () => {
                            await addMember(group.id, memberDraft[group.id], roleDraft[group.id] ?? "member");
                            setMemberDraft({ ...memberDraft, [group.id]: "" });
                          })
                        }
                      >
                        <UserPlus size={16} />
                        Sumar
                      </button>
                    </div>
                  ) : (
                    <p className="admin-hint">Ya están todas las usuarias registradas en este grupo.</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="admin-panel">
          <h2>Usuarias registradas ({users.length})</h2>
          <p className="admin-hint">
            Admin de la app puede ver y editar todo, en todos los grupos. Es distinto del rol dentro de cada grupo.
          </p>

          <div className="admin-table">
            <div className="admin-table-head">
              <span>Nombre</span>
              <span>Email</span>
              <span>Se registró</span>
              <span>Admin</span>
            </div>

            {users.map((user) => {
              const isMe = user.id === profile?.id;

              return (
                <div key={user.id} className="admin-table-row">
                  <span className="admin-member-name">
                    <span className="admin-dot" style={{ background: user.color }} />
                    {user.name}
                    {isMe && <span className="admin-you">vos</span>}
                  </span>
                  <span className="admin-muted">{user.email}</span>
                  <span className="admin-muted">{formatDate(user.createdAt)}</span>
                  <span>
                    {user.isAdmin ? (
                      <button
                        type="button"
                        className="admin-ghost-button"
                        disabled={busy || isMe}
                        title={isMe ? "No podés sacarte el admin a vos misma" : undefined}
                        onClick={() => void runAction(() => setAdmin(user.id, false))}
                      >
                        <ShieldCheck size={14} />
                        Sacar admin
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-ghost-button"
                        disabled={busy}
                        onClick={() => void runAction(() => setAdmin(user.id, true))}
                      >
                        Hacer admin
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
