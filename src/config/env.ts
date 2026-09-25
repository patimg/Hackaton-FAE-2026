import { z } from "zod";
import { isSupportedCountry } from "libphonenumber-js";
const optionalValue = z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional());

export const envSchema = z.object({
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("America/Santiago"),
  DEFAULT_PHONE_COUNTRY: z.string().length(2).refine(isSupportedCountry).default("CL"),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPERATOR_USER_ID: z.uuid(),
  STORAGE_PROVIDER: z.enum(["local", "google-drive"]).default("local"),
  AI_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  AI_MODEL: optionalValue,
  AI_API_KEY: optionalValue,
  AI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  LOCAL_FILES_DIR: z.string().min(1).default("./.data/files"),
  STAGING_DIR: z.string().min(1).default("./.data/staging"),
  MAX_FILES_PER_MESSAGE: z.coerce.number().int().min(1).max(20).default(5),
  MAX_FILE_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(5242880),
  MAX_TOTAL_ATTACHMENT_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(15728640),
  MAX_REQUEST_BYTES: z.coerce.number().int().positive().max(110 * 1024 * 1024).default(16777216),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.80),
}).superRefine((env, ctx) => {
  if (env.MAX_FILE_BYTES > env.MAX_TOTAL_ATTACHMENT_BYTES || env.MAX_TOTAL_ATTACHMENT_BYTES >= env.MAX_REQUEST_BYTES) {
    ctx.addIssue({ code:'custom', path:['MAX_REQUEST_BYTES'], message:'Límites de archivo/total/request incoherentes' });
  }
  let appUrl: URL, supabaseUrl: URL;
  try { appUrl = new URL(env.APP_BASE_URL); supabaseUrl = new URL(env.SUPABASE_URL); }
  catch { return; } // Zod ya registra el formato inválido sin exponer valores.
  if (!['http:', 'https:'].includes(supabaseUrl.protocol)) {
    ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'Debe ser HTTP o HTTPS' });
  }
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    ctx.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'Debe ser HTTP o HTTPS' });
  }
  if (env.APP_MODE === 'demo') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(supabaseUrl.hostname)) {
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'Demo requiere Supabase local' });
    }
    if (env.STORAGE_PROVIDER !== 'local' || env.AI_PROVIDER !== 'deterministic') {
      ctx.addIssue({ code: 'custom', path: ['APP_MODE'], message: 'Demo requiere proveedores locales' });
    }
  }
  if (env.APP_MODE === 'live' && env.AI_PROVIDER !== 'openai') ctx.addIssue({ code:'custom', path:['AI_PROVIDER'], message:'Live requiere un proveedor de IA real configurado' });
  if (env.AI_PROVIDER === 'openai' && (!env.AI_API_KEY || !env.AI_MODEL)) ctx.addIssue({ code:'custom', path:['AI_API_KEY'], message:'AI_PROVIDER=openai requiere AI_API_KEY y AI_MODEL solo en servidor' });
  try { new Intl.DateTimeFormat('es-CL', { timeZone: env.APP_TIMEZONE }); }
  catch { ctx.addIssue({ code: 'custom', path: ['APP_TIMEZONE'], message: 'Zona horaria inválida' }); }
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Configuración incompleta o inválida: ${keys.join(', ')}. Revisa .env.local y README.md.`);
  }
  return result.data;
}
