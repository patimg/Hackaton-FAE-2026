# Fixtures sintéticos

Archivos pequeños generados para pruebas, sin datos de clientes reales.

- A: Carolina existente, logo_nuevo.png → diseno.
- B: cliente nuevo, comprobante.pdf → comprobante_pago (por contexto, sin extracción PDF ni OCR).
- C: referencia.png con «Te mando esto.» → needs_review.
- D: mismos bytes de A en otro mensaje → nuevo documento, mismo SHA-256.
- E: events/E.json es idéntico a events/A.json; reenviar con los mismos bytes → resultado existente, sin filas adicionales.

En /simulator usa los botones Cargar caso A/B/C y selecciona el archivo de files/. Cada «Enviar nuevo evento» genera IDs nuevos; «Reenviar mismo evento» conserva el envío anterior. Los JSON events/ son ejemplos del contrato para pruebas HTTP con sesión de operadora, no un segundo pipeline.
