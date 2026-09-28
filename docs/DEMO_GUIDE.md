# Guion de demostración

Este documento describe el flujo recomendado para demostrar las principales
funcionalidades del sistema durante la presentación.

## 1. Preparación

Antes de comenzar la demostración:

- Verificar que la aplicación se encuentre ejecutándose correctamente.
- Verificar la conexión con la base de datos.
- Comprobar que las variables de entorno necesarias estén configuradas.
- Preparar los datos y archivos que se utilizarán durante la demostración.

## 2. Inicio de la aplicación

Iniciar la aplicación siguiendo las instrucciones indicadas en el `README.md`.

Verificar que la interfaz principal sea accesible antes de comenzar la
demostración.

## 3. Demostración del flujo principal

### 3.1 Recepción de información

Enviar o simular un mensaje proveniente de uno de los canales soportados por
el sistema.

El mensaje puede incluir uno o más documentos adjuntos.

### 3.2 Identificación del cliente

Mostrar cómo el sistema identifica al cliente asociado al mensaje recibido.

### 3.3 Registro de la interacción

Verificar que la interacción quede registrada correctamente en el sistema.

### 3.4 Procesamiento de documentos

Mostrar cómo los documentos recibidos son:

- validados;
- registrados;
- clasificados;
- asociados a la interacción correspondiente;
- almacenados.

### 3.5 WhatsApp

Demostrar el flujo implementado para la recepción o simulación de mensajes
provenientes de WhatsApp.

### 3.6 Consulta de información

Mostrar cómo se puede consultar la información almacenada y acceder a los
documentos asociados.

## 4. Idempotencia

Si corresponde, reenviar un evento previamente procesado y verificar que el
sistema no genere registros duplicados.

## 5. Resultado esperado

Al finalizar la demostración debe ser posible visualizar:

- el cliente identificado;
- las interacciones registradas;
- los documentos recibidos;
- la clasificación de los documentos;
- la relación entre cliente, interacción y documento.

## 6. Consideraciones

Las funcionalidades que dependan de servicios externos deben demostrarse
utilizando el modo disponible para la entrega, ya sea integración real o
simulación.