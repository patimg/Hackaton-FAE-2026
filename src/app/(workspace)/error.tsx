"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <section className="error" role="alert"><h1>No se pudo cargar la información</h1><p>Comprueba que Supabase esté iniciado y las migraciones aplicadas. Tus datos no se han modificado.</p><button onClick={reset}>Reintentar</button></section>;
}
