export const categoryLabels:Record<string,string> = {cotizacion:'Cotización',comprobante_pago:'Comprobante de pago',diseno:'Diseño',referencia:'Referencia',entregable:'Entregable',otro:'Otro'};
export const statusLabels:Record<string,string> = {pending:'Pendiente',classified:'Clasificado',needs_review:'Pendiente de revisión',reviewed:'Revisado',stored:'Guardado',failed:'Fallido'};
export function displayDate(value:string,timezone='America/Santiago') {
  return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value));
}
