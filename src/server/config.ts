import "server-only";
import { parseEnv } from "@/config/env";
export function getEnv() { return parseEnv(process.env); }
