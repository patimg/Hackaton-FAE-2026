import type { AIProvider, Classification, ClassificationBatch, SearchInput, SearchPlan } from './provider';
import type { DocumentCategory } from '../../../domain/documents';
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rules: { category:DocumentCategory; expression:RegExp; tags:string[] }[] = [
  { category:'comprobante_pago', expression:/\b(comprobante|transferencia|deposito|pago realizado)\b/, tags:['pago'] },
  { category:'diseno', expression:/\b(logo|diseno|logotipo|arte para)\b/, tags:['diseño'] },
  { category:'cotizacion', expression:/\b(cotizacion|presupuesto)\b/, tags:['cotización'] },
  { category:'entregable', expression:/\b(entrega final|entregable|version final)\b/, tags:['entregable'] },
  { category:'referencia', expression:/\b(ejemplo de referencia|como referencia|referencia para|inspiracion)\b/, tags:['referencia'] },
];
export class DeterministicAIProvider implements AIProvider {
  async classifyDocuments(input:ClassificationBatch) {
    const results = input.documents.map(document => {
      const context = normalize(`${input.subject || ''} ${input.text} ${document.text || ''}`);
      const matches = rules.filter(rule => rule.expression.test(context));
      // El nombre puede desambiguar un mensaje con varios adjuntos; nunca es evidencia suficiente por sí solo.
      const nameMatches = matches.filter(rule => rule.expression.test(normalize(document.filename).replace(/[^a-z0-9]+/g, ' ')));
      const match = matches.length === 1 ? matches[0] : nameMatches.length === 1 ? nameMatches[0] : undefined;
      return {
        document_id:document.document_id, category:match?.category || 'otro',
        summary:match ? `Documento ${match.category.replaceAll('_',' ')} recibido: ${document.filename}` : `Archivo sin contexto suficiente: ${document.filename}`,
        tags:match?.tags || [], confidence:match ? 0.92 : 0.25,
        reason:match ? 'Regla determinista: el contexto contiene una referencia explícita a esta categoría.' : 'Clasificación simulada: el nombre del archivo no basta y el mensaje es ambiguo.',
      } satisfies Classification;
    });
    return { schema_version:'1' as const, results };
  }
  async interpretSearch(input:SearchInput): Promise<SearchPlan> {
    // Punto de extensión; la búsqueda en UI continúa fuera de fase 2.
    return { schema_version:'1', mode:'lexical', terms:input.query.trim().split(/\s+/).filter(Boolean) };
  }
}
