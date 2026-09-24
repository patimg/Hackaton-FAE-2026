import { Simulator } from '@/components/simulator';
import { getEnv } from '@/server/config';
import { requireOperator } from '@/server/auth/operator';
export default async function Page() {
  await requireOperator();
  const env=getEnv();
  return <><h1>Simulador de entrada</h1><p>Recibe un mensaje de prueba y conserva sus documentos y contexto.</p><Simulator limits={{files:env.MAX_FILES_PER_MESSAGE,fileBytes:env.MAX_FILE_BYTES,totalBytes:env.MAX_TOTAL_ATTACHMENT_BYTES}}/></>;
}
