import { supabase } from "../../lib/supabaseClient";
import type { GroupInvite, GroupRole, InvitePreview, MyGroup } from "./types";

type GroupRow = { id: string; name: string; description: string };
type MemberRow = { group_id: string; user_id: string; role: GroupRole };
type ProfileRow = { id: string; name: string; color: string };
type InviteRow = {
  id: string;
  group_id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
};
type PreviewRow = {
  group_id: string;
  group_name: string;
  group_description: string;
  already_member: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

/** El link que se comparte. Usa el hash para no depender de un router. */
export function buildInviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#invitacion=${code}`;
}

/**
 * Trae solo los grupos de los que la usuaria es parte: no hace falta filtrar
 * acá porque las policies de Supabase ya no dejan ver los demás.
 */
export async function listMyGroups(currentUserId: string): Promise<MyGroup[]> {
  const [groupsResult, membersResult, profilesResult] = await Promise.all([
    supabase.from("groups").select("id, name, description").order("created_at"),
    supabase.from("group_members").select("group_id, user_id, role"),
    supabase.from("profiles").select("id, name, color"),
  ]);

  if (groupsResult.error) fail(groupsResult.error.message);
  if (membersResult.error) fail(membersResult.error.message);
  if (profilesResult.error) fail(profilesResult.error.message);

  const groups = (groupsResult.data ?? []) as GroupRow[];
  const members = (membersResult.data ?? []) as MemberRow[];
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return groups
    .map((group) => {
      const groupMembers = members.filter((member) => member.group_id === group.id);
      const mine = groupMembers.find((member) => member.user_id === currentUserId);

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        myRole: mine?.role ?? "member",
        members: groupMembers.map((member) => ({
          userId: member.user_id,
          name: profilesById.get(member.user_id)?.name ?? "Alguien",
          color: profilesById.get(member.user_id)?.color ?? "#d36a97",
          role: member.role,
        })),
      };
    })
    .filter((group) => group.members.some((member) => member.userId === currentUserId));
}

export async function createGroup(name: string, description: string): Promise<void> {
  const { error } = await supabase.rpc("create_group", {
    group_name: name,
    group_description: description,
  });

  if (error) fail(error.message);
}

export async function listInvites(): Promise<GroupInvite[]> {
  const { data, error } = await supabase
    .from("group_invites")
    .select("id, group_id, code, created_at, expires_at, max_uses, uses_count")
    .eq("revoked", false)
    .order("created_at", { ascending: false });

  if (error) fail(error.message);

  return ((data ?? []) as InviteRow[]).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
  }));
}

export async function createInvite(groupId: string, expiresInDays: number | null): Promise<void> {
  const { error } = await supabase.rpc("create_group_invite", {
    target_group_id: groupId,
    expires_in_days: expiresInDays,
    invite_max_uses: null,
  });

  if (error) fail(error.message);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_group_invite", { invite_id: inviteId });
  if (error) fail(error.message);
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const { data, error } = await supabase.rpc("preview_group_invite", { invite_code: code });

  if (error) fail(error.message);

  const rows = (data ?? []) as PreviewRow[];
  const row = rows[0];

  if (!row) fail("No encontramos esta invitación.");

  return {
    groupId: row.group_id,
    groupName: row.group_name,
    groupDescription: row.group_description,
    alreadyMember: row.already_member,
  };
}

export async function joinWithCode(code: string): Promise<void> {
  const { error } = await supabase.rpc("join_group_with_code", { invite_code: code });
  if (error) fail(error.message);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_group", { target_group_id: groupId });
  if (error) fail(error.message);
}
