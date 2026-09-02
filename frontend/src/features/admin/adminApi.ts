import { supabase } from "../../lib/supabaseClient";
import type { AdminGroup, AdminMembership, AdminUser, GroupRole } from "./types";

// Filas tal cual vienen de Supabase (snake_case).
type UserRow = {
  id: string;
  name: string;
  color: string;
  is_admin: boolean;
  email: string;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
};

function fail(message: string): never {
  throw new Error(message);
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) fail(error.message);

  return ((data ?? []) as UserRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isAdmin: row.is_admin,
    email: row.email,
    createdAt: row.created_at,
  }));
}

export async function listGroups(): Promise<AdminGroup[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, description, created_by, created_at")
    .order("created_at");

  if (error) fail(error.message);

  return ((data ?? []) as GroupRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function listMemberships(): Promise<AdminMembership[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, user_id, role, joined_at");

  if (error) fail(error.message);

  return ((data ?? []) as MembershipRow[]).map((row) => ({
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

export async function createGroup(name: string, description: string): Promise<void> {
  const { error } = await supabase.rpc("create_group", {
    group_name: name,
    group_description: description,
  });

  if (error) fail(error.message);
}

export async function addMember(groupId: string, userId: string, role: GroupRole): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role });

  if (error) fail(error.message);
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) fail(error.message);
}

export async function changeRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) fail(error.message);
}

export async function setAdmin(userId: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_admin", {
    target_user_id: userId,
    value,
  });

  if (error) fail(error.message);
}
