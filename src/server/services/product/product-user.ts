import { prisma } from "@/server/db/prisma";

export const DEFAULT_USER_ID = 1;
export const DEFAULT_USER_EMAIL = "local-user@msa.local";
export const DEFAULT_USER_NAME = "과제 사용자";

export async function getDefaultUser() {
  return prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: { id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL, name: DEFAULT_USER_NAME },
    update: {},
  });
}
