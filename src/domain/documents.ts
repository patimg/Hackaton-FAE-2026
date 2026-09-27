export const categories = ['cotizacion', 'comprobante_pago', 'diseno', 'referencia', 'entregable', 'otro'] as const;
export type DocumentCategory = typeof categories[number];
export const categoryFolders: Record<DocumentCategory, string> = {
  cotizacion: 'Cotizaciones', comprobante_pago: 'Comprobantes', diseno: 'Disenos',
  referencia: 'Referencias', entregable: 'Entregables', otro: 'Otros',
};
