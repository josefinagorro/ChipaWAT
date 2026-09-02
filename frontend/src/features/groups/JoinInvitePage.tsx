import { useEffect, useState } from "react";
import { joinWithCode, previewInvite } from "./groupsApi";
import type { InvitePreview } from "./types";
import "./groups.css";

export function JoinInvitePage({ code, onDone }: { code: string; onDone: () => void }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    previewInvite(code)
      .then((result) => {
        if (isMounted) setPreview(result);
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "No pudimos leer esta invitación.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);

    try {
      await joinWithCode(code);
      setJoined(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No pudimos sumarte al grupo.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="groups-shell invite-shell">
      <div className="invite-card">
        <div className="invite-brand">
          <div className="invite-brand-mark">CW</div>
          <div>
            <p>ChipaWAT</p>
            <span>Invitación a un grupo</span>
          </div>
        </div>

        {loading && <p className="groups-hint">Buscando la invitación...</p>}

        {error && (
          <>
            <p className="groups-error">{error}</p>
            <button type="button" className="groups-ghost-button" onClick={onDone}>
              Ir a la app
            </button>
          </>
        )}

        {!loading && !error && preview && (
          <>
            {joined ? (
              <>
                <h1>¡Ya sos parte de {preview.groupName}!</h1>
                <p className="groups-hint">Vas a ver los gastos, el calendario y la lista del super del grupo.</p>
                <button type="button" className="groups-primary-button" onClick={onDone}>
                  Entrar a la app
                </button>
              </>
            ) : preview.alreadyMember ? (
              <>
                <h1>Ya estabas en {preview.groupName}</h1>
                <p className="groups-hint">No hace falta que hagas nada más.</p>
                <button type="button" className="groups-primary-button" onClick={onDone}>
                  Entrar a la app
                </button>
              </>
            ) : (
              <>
                <h1>Te invitaron a {preview.groupName}</h1>
                {preview.groupDescription && <p className="groups-hint">{preview.groupDescription}</p>}
                <button type="button" className="groups-primary-button" onClick={() => void handleJoin()} disabled={joining}>
                  {joining ? "Sumándote..." : "Unirme al grupo"}
                </button>
                <button type="button" className="groups-ghost-button" onClick={onDone}>
                  Ahora no
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
