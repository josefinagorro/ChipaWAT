export type GroupRole = "owner" | "admin" | "member";

export type GroupMemberInfo = {
  userId: string;
  name: string;
  color: string;
  role: GroupRole;
};

export type MyGroup = {
  id: string;
  name: string;
  description: string;
  myRole: GroupRole;
  members: GroupMemberInfo[];
};

export type GroupInvite = {
  id: string;
  groupId: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  usesCount: number;
};

export type InvitePreview = {
  groupId: string;
  groupName: string;
  groupDescription: string;
  alreadyMember: boolean;
};
