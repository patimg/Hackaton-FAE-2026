export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { parseEnv } = await import('./config/env');
    parseEnv(process.env);
  }
}
