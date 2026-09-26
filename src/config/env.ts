import { z } from "zod";
import { isSupportedCountry } from "libphonenumber-js";
const optionalValue = z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional());

export const envSchema = z.object({
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("America/Santiago"),
  DEFAULT_PHONE_COUNTRY: z.string().length(2).refine(isSupportedCountry).default("CL"),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPERATOR_USER_ID: z.uuid(),
  STORAGE_PROVIDER: z.literal("google-drive").default("google-drive"),
  GMAIL_USER: z.email().optional(),
  GMAIL_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(86400000).default(30000),
  INGEST_API_TOKEN: z.string().min(1),
  WHATSAPP_AUTH_DIR: z.string().min(1).default("./.data/whatsapp-auth"),
  AI_PROVIDER: z.literal("openai").default("openai"),
  AI_MODEL: optionalValue,
  AI_API_KEY: optionalValue,
  AI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  STAGING_DIR: z.string().min(1).default("./.data/staging"),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalValue,
  MAX_FILES_PER_MESSAGE: z.coerce.number().int().min(1).max(20).default(5),
  MAX_FILE_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(5242880),
  MAX_TOTAL_ATTACHMENT_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(15728640),
  MAX_REQUEST_BYTES: z.coerce.number().int().positive().max(110 * 1024 * 1024).default(16777216),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.80),
  GOOGLE_CLIENT_ID: optionalValue,
  GOOGLE_CLIENT_SECRET: optionalValue,
  GOOGLE_REFRESH_TOKEN: optionalValue,
  GMAIL_ACCOUNT_ID: optionalValue,
  GMAIL_QUERY: z.string().default('is:unread'),
  GMAIL_MAX_MESSAGES: z.coerce.number().int().min(1).max(100).default(25),
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
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    ctx.addIssue({ code:'custom', path:['GOOGLE_CLIENT_ID'], message:'Google Drive requiere credenciales OAuth y carpeta raíz' });
  }
  if (!env.GMAIL_USER && !env.GMAIL_ACCOUNT_ID) {
    ctx.addIssue({ code:'custom', path:['GMAIL_USER'], message:'Configura la cuenta que utilizará el conector de Gmail' });
  }
  if (!env.AI_API_KEY || !env.AI_MODEL) ctx.addIssue({ code:'custom', path:['AI_API_KEY'], message:'La búsqueda con IA requiere AI_API_KEY y AI_MODEL solo en servidor' });
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
