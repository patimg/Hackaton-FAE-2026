import "server-only";
import { redirect } from "next/navigation";
import { authClient } from "./client";
import { getEnv } from "@/server/config";

export async function getOperator() {
  const client = await authClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.id !== getEnv().OPERATOR_USER_ID) return null;
  return user;
}
export async function requireOperator() {
  const user = await getOperator();
  if (!user) redirect('/login');
  return user;
}
