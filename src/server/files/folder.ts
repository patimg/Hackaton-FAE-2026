import { categoryFolders, type DocumentCategory } from '../../domain/documents';
export function folderFor(input:{ clientFolder:string | null; receivedAt:string; timezone:string; category:DocumentCategory; needsReview:boolean }) {
  const date = new Intl.DateTimeFormat('en', { timeZone:input.timezone,year:'numeric',month:'2-digit' }).formatToParts(new Date(input.receivedAt));
  const year = date.find(part => part.type === 'year')!.value;
  const month = date.find(part => part.type === 'month')!.value;
  if (!input.clientFolder) return `sin_asignar/${year}/${month}/por_revisar`;
  return `clientes/${input.clientFolder}/${year}/${month}/${input.needsReview ? 'por_revisar' : categoryFolders[input.category].toLowerCase()}`;
}
