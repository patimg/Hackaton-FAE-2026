# Limitaciones conocidas

Este documento resume las principales limitaciones conocidas de la solución
desarrollada para la Hackatón FAE 2026.

## 1. Alcance del proyecto

La solución fue desarrollada dentro del alcance y tiempo disponible para la
hackatón, por lo que corresponde a un prototipo funcional y no a una
implementación productiva completa.

## 2. Integraciones externas

Algunas funcionalidades dependen de servicios externos.

Dependiendo de la configuración utilizada para la demostración, algunas
integraciones pueden funcionar mediante simulación en lugar de conectarse
directamente con servicios reales.

El estado final de cada integración debe quedar documentado antes de la
entrega.

## 3. WhatsApp

La integración de WhatsApp se encuentra limitada al flujo implementado para
el proyecto.

No necesariamente contempla todos los tipos de mensajes, archivos, estados,
errores o comportamientos disponibles en una integración productiva con
WhatsApp.

## 4. Gmail

La integración o simulación de Gmail se encuentra limitada a los casos de uso
necesarios para demostrar el flujo principal de recepción y procesamiento de
información.

## 5. Procesamiento de documentos

La solución permite procesar los documentos contemplados por el sistema,
pero pueden existir limitaciones relacionadas con:

- formatos no soportados;
- archivos dañados;
- archivos excesivamente grandes;
- contenido que no pueda ser clasificado correctamente;
- información insuficiente para identificar automáticamente un documento.

## 6. Clasificación automática

Los resultados obtenidos mediante mecanismos automáticos de clasificación
pueden requerir validación humana.

La clasificación no debe considerarse infalible.

## 7. Seguridad

La solución no pretende implementar todos los controles de seguridad
necesarios para un entorno de producción.

Entre otros aspectos, una implementación productiva podría requerir:

- gestión avanzada de permisos;
- auditoría;
- monitoreo;
- análisis antivirus de documentos;
- políticas de respaldo;
- rotación y gestión segura de credenciales;
- controles adicionales de protección de datos.

## 8. Escalabilidad y disponibilidad

La solución está orientada al alcance de la demostración y no ha sido
diseñada ni evaluada para garantizar:

- alta disponibilidad;
- tolerancia completa a fallos;
- procesamiento masivo;
- balanceo de carga;
- escalamiento horizontal.

## 9. Idempotencia y recuperación

El sistema implementa mecanismos para reducir la generación de información
duplicada ante eventos repetidos.

Sin embargo, no se garantiza un modelo distribuido de procesamiento
exactamente una vez entre todos los servicios externos involucrados.

## 10. Uso en producción

Antes de utilizar esta solución en un entorno productivo sería necesario
realizar una evaluación adicional de:

- seguridad;
- privacidad;
- rendimiento;
- escalabilidad;
- disponibilidad;
- cumplimiento normativo;
- manejo de errores;
- respaldo y recuperación.