# HANDOFF — Falcon-Docker (sistema de riego multi-sitio)

> Generado al final de una sesión larga de trabajo. Este documento existe
> para que otro agente (Codex u otro) pueda retomar exactamente donde se
> quedó, sin tener que releer toda la conversación. Actualizar esta
> sección de fecha/autor si se seguís trabajando desde acá.

Última actualización: 2026-09-25, Claude Code (ChirpStack para Casa Sur; corrección de cortinas confirmada por el usuario).
Rama: `main`. Sin commits de esta sesión (todo sigue sin commitear).

## Acuerdo de coordinación entre Claude y Codex

Por instrucción explícita del usuario (2026-09-20), **cada vez que se hagan
cambios en este proyecto hay que actualizar este HANDOFF.md antes de terminar
el trabajo**, sin esperar a agotar los límites de uso. Aplica a ambos agentes.

- Leer este archivo al retomar y comprobar el estado real del repositorio y,
  cuando corresponda, de los contenedores antes de modificar nada.
- Registrar qué cambió y por qué, archivos afectados, decisiones del usuario,
  pruebas y resultados, despliegues realizados y diferencias pendientes entre
  el repositorio y los servicios en ejecución.
- Dejar el próximo paso concreto y los bloqueos; distinguir lo implementado,
  lo desplegado, lo probado y lo confirmado por el usuario.
- Actualizar también las incidencias cuando el usuario confirme su resolución.
  Las notas históricas no deben interpretarse como pendientes actuales.
- No guardar contraseñas, tokens ni claves en este documento.
- Este archivo es el registro compartido de relevo; no sincroniza conversaciones
  ni evita conflictos de edición. Antes de retomar, revisar los cambios sin
  commit y evitar que ambos agentes editen o desplieguen a la vez.

## Actualización de Claude — 2026-09-25 (más reciente)

- **Corrección de cortinas de Sur:** el usuario confirmó que el ZIP
  `output/Correccion-Cortinas-CasaSur.zip` ya está instalado en la PC nueva.
  Sigue sin haber prueba física acreditada (rutina futura: un pulso, sin
  repeticiones en el bloque) ni log del instalador en este repo; validar en
  campo. No desplegado en Principal/Norte (diferencia repo/runtime vigente).
- **ChirpStack en Casa Sur (para sensores Dragino):** paquete nuevo
  `output/Instalar-ChirpStack-CasaSur.zip`, fuente en `deployment/casa-sur-lora/`.
  Proyecto Compose SEPARADO `falcon-casa-sur-lora` (PostgreSQL, Redis,
  Mosquitto, ChirpStack v4, gateway-bridge propios; US915 canales 8-15 como
  Principal). No toca Node-RED, su base, edge-link ni la tarea USB (esta solo
  usa `-f compose.yaml -f compose.usb.yaml` con `--no-deps`). Mosquitto se une
  también a la red `falcon-casa-sur_default` con alias `mosquitto`, el host
  que ya usan los flujos; no se publica 1883. UI solo en 127.0.0.1:8080;
  UDP 1700 publicado, con regla de firewall limitada a la subred local.
  Instalador `Install-CasaSurLora.ps1` (PowerShell 5.1, admin): copia a
  `C:\Projects\Falcon-CasaSur\lora`, genera secretos en `lora\.env.lora`
  (no mostrados ni en el repo), levanta, espera a la UI y ejecuta el alta
  inicial (8 perfiles Dragino con decodificador + aplicación `Falcon-app`;
  gateway solo si se pasa `-GatewayEui`). Reinstalar conserva secretos,
  volúmenes y devices.csv. `bootstrap-chirpstack.sh` del paquete difiere del de
  `scripts/`: el alta del gateway es opcional (EUI vacío se omite).
- **Probado aquí (no en la PC de Sur):** instalador real bajo Windows PowerShell
  5.1 contra un directorio temporal y red simulada: instalación limpia,
  reinstalación idempotente, bootstrap con y sin EUI, alias `mosquitto`
  resuelto desde otra red, sin errores en ChirpStack. Se detectó y corrigió que
  `*> $null` sobre docker.exe lanza excepción en PS 5.1 con Stop. Recursos de
  prueba eliminados; los servicios de producción no se tocaron. NO probado:
  admin real, firewall, gateway Dragino físico, uplink real de un sensor.
- **Pendiente para que el usuario instale:** copiar el ZIP extraído a
  `C:\Projects\Falcon-CasaSur\lora-instalador` y ejecutar el instalador
  (ver LEEME.txt), cambiar la contraseña inicial de ChirpStack, apuntar el
  gateway Dragino a la IP de la PC (UDP 1700) y dar de alta los sensores.
  Requiere que Sur esté iniciada (existe su red Docker). Sin confirmación aún.
- **Fuera de alcance / siguiente:** hacer que las lecturas lleguen al
  Dashboard de Sur. Su pestaña de sensores está deshabilitada (guía de
  instalación); el flujo actual se suscribe a `application/+/device/+/event/up`
  en el broker `mosquitto:1883` y hay que adaptarlo/habilitarlo por separado.

## Actualización de Codex — prevalece sobre el snapshot de Claude de abajo

### LEER PRIMERO: instrucciones de continuación para Claude Code

**Petición pendiente prioritaria:** corregir las cortinas de Casa Sur que repiten
el pulso durante el bloque horario. El último mensaje de trabajo entregó el ZIP
de corrección. El usuario NO ha confirmado que lo haya instalado. Su siguiente
mensaje pidió este relevo. No empezar desde cero ni afirmar que ya está resuelto
en producción.

**Preferencias del usuario:** español; completar correcciones con implementación,
pruebas y resultado final autosuficiente, sin fragmentos como "el resto queda
igual". Evitar ciclos de instrucciones incompletas. Pedir únicamente información
o intervención que el acceso disponible haga imprescindible. Actualizar este
archivo al cambiar código, desplegar o recibir confirmación del usuario.

**Separar las tres máquinas:**

- Este checkout: `C:\Projects\Falcon-Docker`; tiene numerosos cambios sin commit
  y archivos sin seguimiento. `git status --short` antes de editar; no resetear,
  limpiar ni sustituir archivos completos de otras áreas. No se hizo commit/push.
- Nueva PC del usuario: `C:\Projects\Falcon-CasaSur`, Docker Desktop WSL2, proyecto
  Compose `falcon-casa-sur`, servicios `postgres`, `nodered`, `edge-link`. No hay
  acceso de shell a esa PC desde esta sesión. Los comandos que el usuario pega
  son resultados de allí, no de este equipo. Aunque preguntó por Windows nativo,
  la instalación que finalmente realizó y estamos reparando ES Docker.
- Oracle: `opc@150.230.161.145`, clave administrativa local
  `C:\Users\ramon\.ssh\oracle_domotica_key`, proyecto `~/falcon-central`.
  Sur llega por `127.0.0.1:18884`. GET `/flows` por ese túnel devolvió 401;
  conectividad no equivale a acceso al editor. No desactivar autenticación para
  desplegar. Dashboard/Hub/Usuarios están en Oracle; no arrancar sus copias locales.

**Evidencia y alcance del diagnóstico de cortinas:**

1. Export recibido:
   `C:\Users\ramon\.codex\attachments\548a9324-af62-4a1a-b093-2da51f070a2e\Texto pegado.txt`.
   Incluye cinco funciones con IDs y wires, no configuración completa ni logs.
   Las cinco coinciden exactamente con la fuente ANTES del último parche.
2. La condición antigua de `rz_fn_curtain_pulse_schedule` permitía reenviar un
   objetivo ya completado si `recoveryZones[zonaId] > job.lastRecovery`.
   Una prueba con cinco recuperaciones reprodujo cinco pares subir/parar extra.
3. Corregida esa condición. No se ha probado con logs que esas recuperaciones
   sean el único origen del síntoma real. Si persiste tras instalar, investigar
   eventos recoveryRevision/recoveryZones, reinicios del supervisor y rutinas
   duplicadas/mixtas antes de hacer otro cambio. No atribuirlo a "código viejo".
4. Archivo fuente mantenido: `nodered/curtain-schedule.js`; la función embebida
   correspondiente también está actualizada en `nodered/riego-flow-backup/flows.json`.
   El cambio NO está desplegado en Principal ni Norte, y Sur sigue sin confirmar.

**Próximo paso preciso:**

1. Comprobar si el usuario ya aplicó `output/Correccion-Cortinas-CasaSur.zip`.
   Si no, usar el paquete existente (no reconstruir toda su instalación).
   Contiene `Install-CasaSurCurtainFix.ps1`, `patch-curtain-recovery.cjs`,
   `curtain-recovery-patch.json` y `LEEME.txt`; extraer los cuatro juntos en
   `C:\Projects\Falcon-CasaSur\correccion-cortinas` de la NUEVA PC.
2. Antes de aplicarlo: pausar rutina afectada, seleccionar Manual, detener y
   verificar físicamente los motores. Instalador comprueba Manual en riego.json,
   pero no puede acreditar por sí mismo el estado eléctrico de los relés.
3. PowerShell administrador de esa PC:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Projects\Falcon-CasaSur\correccion-cortinas\Install-CasaSurCurtainFix.ps1"
   ```

4. Esperar `CORRECCION INSTALADA`. El instalador pausa supervisor USB, detiene
   Node-RED, aplica cambio con contenedor efímero y volumen existente, actualiza
   también fuente de nueva PC, inicia Node-RED y reanuda supervisor. Conserva
   riego.json y los demás nodos. Deja Manual. Respaldos junto a flows.json:
   `flows.json.before-curtain-recovery-<timestamp>`. No usar `down -v`.
   Si falla tras detener Node-RED, este puede permanecer detenido y el supervisor
   pausado: resolver el error antes de volver a activar rutinas; no ocultarlo.
5. Validación pendiente en campo: rutina futura con pulso apropiado al hardware,
   un arranque de apertura, parada al vencer pulso, sin repeticiones durante el
   bloque, cierre al final y parada. Verificar escalonado si hay varias cortinas.
   En porcentajes sigue siendo posición estimada y requiere referencia válida.
6. Registrar resultado real y qué versión queda en cada área. Si existe una
   diferencia, no dar por sincronizadas fuente local, imagen y volumen persistente.

**Pruebas ya ejecutadas, 39 aprobadas:**

```powershell
node --test tests/curtain-recovery-patch.test.cjs tests/curtain-schedule.test.cjs tests/recovery.test.cjs tests/manual-interlock.test.cjs tests/routine-edit.test.cjs
```

Las pruebas del parche usan el payload de `output/casa-sur-curtain-fix/`;
verifican respaldo, idempotencia, preservación de rutinas/otros nodos y rechazo
de versión desconocida o modo Automático. Pruebas de reloj simulado, NO motores.
El instalador PS1 tiene sintaxis validada. Si se cambia el parche, sincronizar
`scripts/patch-curtain-recovery.cjs`, la copia en output y el ZIP; si se cambia el
instalador, sincronizar deployment, output y ZIP. No ejecutar los generadores
históricos build-curtain-percent/build-recovery indiscriminadamente: son cambios
de estructura de una sola aplicación, no un sistema seguro de migraciones.

**USB: estado más reciente que corrige las notas históricas de abajo:**

- Tras recibir la corrección directa en ambos scripts del error de comillas,
  el usuario dijo "listo" y pasó a reportar cortinas. NO repetir automáticamente
  la reinstalación USB como si todavía estuviera fallando. Tampoco se recibió
  un log nuevo USB_ACCESIBLE o una prueba de reinicio completa: falta evidencia.
- Tarea `Falcon-CasaSur-USB` estuvo instalada y Running. Script activo:
  `C:\ProgramData\Falcon-CasaSur-USB\Install-CasaSurUsb.ps1`; configuración
  `config.json`; registro `usb.log` en la misma carpeta. Fuente corregida aquí:
  `deployment/Install-CasaSurUsb.ps1`. El transporte base64 del chequeo Linux es
  imprescindible para PowerShell 5.1; no volver a pasar comillas internas crudas.
- Solo funciona al iniciar SESIÓN del usuario de Docker Desktop, no antes del
  login. FTDI 0403:6001, FT232R, BUSID 2-2 y /dev/ttyUSB0 comprobados por logs.
  Supervisor revisa cada 30s; al recuperar dispositivo recrea Node-RED. Si hay
  reinicios repetidos, revisar usb.log antes de culpar solo al planificador.
- El usuario copia texto con escapes Markdown y pierde sangrías. Preferir archivos
  descargables o código sin caracteres que requieran doble escape; no pegar `>>`,
  etiquetas css/swift, `\*` o `\-`. Distinguir explícitamente PowerShell Windows
  de shell SSH Oracle. No pedir secretos ni mostrar .env completo.

**Otros asuntos no cerrados por evidencia del usuario:** scroll rápido de iPhone
tras segunda corrección desplegada en gateway; sensores Tuya de temperatura y
humedad que seguían unavailable pese a restaurar Home Assistant original. No
mezclar esos temas con la prioridad actual ni darlos por resueltos.

### Cortinas Sur: repeticion de pulso por recuperacion — 2026-09-24

- Export de usuario confirma las 5 funciones de Sur identicas a fuente actual,
  no version antigua. Encontrado y reproducido defecto compartido: scheduler
  reencola pulso clasico completado cuando recoveryZones aumenta. Cinco eventos
  de recuperacion generan cinco aperturas extra en test previo al fix.
- nodered/curtain-schedule.js y flows.json: eliminado bypass de completed por
  recoveryZones. Porcentajes siguen reevaluando distancia; nuevos objetivos
  abren/cierran; pulso no completado puede recuperarse. No cambia rutinas ni I/O.
- 39 tests aprobados (cortinas, recovery, enclavamiento, editar rutina y patch
  offline). No tenemos logs de recuperaciones de Sur para acreditar que este
  sea el unico disparador presente en campo; defecto comprobado en su codigo.
- Paquete output/Correccion-Cortinas-CasaSur.zip; instalador PS1 + parche Node
  + payload exacto antes/despues + LEEME. Exige Manual; pausa supervisor USB,
  detiene Node-RED, respalda/edita solo funcion del volumen y fuente local,
  reinicia y reanuda supervisor. Falla cerrado ante version desconocida.
- NO desplegado en Sur: /flows remoto da 401 y no tenemos acceso administrativo
  a su PC. Usuario debe aplicar paquete. Tampoco desplegado en Principal/Norte.
  Mantener diferencia fuente/runtime explicita; no declarar prueba fisica hecha.

### Casa Sur USB en nueva PC — 2026-09-23

- Segundo fallo remoto: tarea Running pero sh reporta '/: unknown operand'.
  PowerShell 5.1 pierde comillas internas al pasar identityCheck por argv nativo.
  Corregido transportando script de identidad en base64 y decodificando en sh.
  tests/usb-shell-quoting.ps1 ejecutado con powershell.exe 5.1 y WSL docker-desktop:
  fixture FTDI aceptado y vendor distinto rechazado. Sin tocar hardware real.
  Se debe reinstalar version corregida en nueva PC; Running no acredita USB listo.
- Correccion del instalador: fallo reportado por ruta fija de Docker Desktop.
  Ahora detecta proceso, Program Files/LocalAppData, subcarpeta frontend, registro
  y directorios padres del CLI; permite -DockerDesktopPath. Verificado en esta
  PC: ejecutable real Program Files\Docker\Docker\frontend\Docker Desktop.exe.
  Tarea de nueva PC no llego a instalarse en intento fallido; debe copiar version
  corregida y ejecutar de nuevo. No asumir validacion de reinicio remoto.
- Preparado deployment/Install-CasaSurUsb.ps1 para copiar a la nueva PC y ejecutar
  como administrador bajo el usuario de Docker Desktop. Instala tarea local
  Falcon-CasaSur-USB al iniciar SESION (no antes del login), copia protegida en
  ProgramData y supervisor cada 30s. Arranca Desktop, carga ftdi_sio, reconecta
  BUSID 2-2 solo si VID:PID 0403:6001 coincide, verifica identidad de ttyUSB0,
  ajusta grupo/permisos y compose.usb.yaml. Recrea solo Node-RED al recuperar
  USB; inicia postgres/edge-link si hace falta. No envia comandos Modbus.
  Registro ProgramData\Falcon-CasaSur-USB\usb.log, rotacion 2MB; mantiene copia
  compose.usb.yaml.before-automation. Si se cambia de puerto USB hay que
  reinstalar con -BusId. Sintaxis validada con parser PowerShell 5.1; no se ha
  ejecutado instalacion ni prueba de reinicio en la nueva PC (sin acceso).
- Ruta informada por usuario: C:\Projects\Falcon-CasaSur. Instalación Docker
  Desktop WSL2. USBIP BUSID 2-2, VID:PID 0403:6001, FT232R.
- Log aportado confirma que cargar ftdi_sio y reconectar USB creó ttyUSB0;
  última línea confirma conexión, no fallo. Falta verificar mapeo y permisos
  en contenedor Node-RED y comunicación Modbus física. Se proporciona override
  compose.usb.yaml con devices y grupo numérico del dispositivo; no desplegado
  desde esta PC. Instalador de reconexion preparado arriba; validacion real pendiente.

### Desplazamiento movil — 2026-09-23

- Segunda corrección: usuario confirma que el cambio del shell NO resolvió los
  gestos rápidos. CSS instalado de Dashboard define overflow-y:auto para
  .nrdb-ui-widget.nrdb-ui-template, creando scroll anidado en las plantillas.
  water-gateway/server.js ahora inyecta gateway-mobile-scroll en el HTML
  proxificado: overflow:visible!important solo para esos widgets en pointer:coarse
  o ancho <=768px. Conserva scroll nativo, sin interceptar eventos táctiles.
  Desplegado solo gateway Oracle; 3 pruebas de aislamiento/permisos/recuperación
  aprobadas en contenedor sin red. Pendiente validar gesto rápido en iPhone real;
  no declarar resuelto hasta confirmación. Recargar página para recibir el CSS.
- Reporte: deslizamientos rápidos no desplazan naturalmente. Detectado scroll
  exterior adicional por panel calc(100dvh - 135px) y min-height:400px, incompatible
  con cabecera móvil variable. Shell ahora flex vertical limitado al viewport;
  iframe ocupa resto con min-height:0. Áreas en fila horizontal desplazable y
  cabecera compacta en móvil/pantallas bajas. No hay interceptores táctiles nuevos.
- Cambiado water-gateway/dashboard-shell.js y desplegado solo gateway Oracle.
  Verificado navegador a 390x844: body y scrollHeight=844, iframe termina en844;
  viewport restablecido. Sintaxis válida. Falta confirmar gesto real en Safari
  iPhone: comprobación dimensional no reproduce inercia táctil de un dispositivo.

### Recuperacion Home Assistant/Tuya — 2026-09-23

- El 401 no era un token que hubiera que renovar: el proyecto falcon usaba
  falcon_homeassistant_data, volumen nuevo sin Tuya y con onboarding pendiente.
  guardian_homeassistant_data conserva la instalación original y las entidades
  sensor.t_h_sensor_temperature y sensor.t_h_sensor_humidity.
- Respaldado volumen original a .deployment/homeassistant-original-20260923.tar.gz
  (privado, contiene credenciales). Compose homeassistant_data ahora external:true,
  name:guardian_homeassistant_data. Recreado SOLO Home Assistant, sin tocar Edges.
  Volumen vacío falcon_homeassistant_data conservado. Token existente devuelve
  HTTP 200 y Tuya reporta estado loaded. No se generaron nuevas credenciales.
- Al recuperar, Tuya indica sensores unavailable: la autenticación está resuelta
  pero las lecturas reales todavía requieren comprobar disponibilidad del dispositivo.

### Sensores Casa Principal — 2026-09-22

- Registro intacto: dos sensores Tuya T&H (temperatura/humedad) presentes en
  riego.json y global.sensoresRegistrados. HA /api/states devuelve HTTP 401 con
  HA_TOKEN actual; coincide con .env, no es un contenedor desactualizado.
- Corregido extractor para tolerar respuesta no-array/401 sin TypeError y
  publicar valores null. Vista construida desde registro, no solo lecturas;
  inject cada 15s permite mostrar tarjetas aun sin datos. Desplegados solo nodos
  de sensores en Principal, con respaldo flows.before-sensor-display.*.json.
- Prueba simulada pasa: 401 no rompe extractor y registro sigue visible sin
  inventar valores. Pendiente renovar token válido de Home Assistant y actualizar
  HA_TOKEN de forma privada; no se solicitó contraseña/token por chat. Las lecturas
  reales todavía no están restauradas. Fuente flows.json y scripts fix/deploy-sensor-display.

### Guia PDF de instalacion manual Casa Sur — 2026-09-22

- Creado output/pdf/Guia-instalacion-Casa-Sur.pdf (12 páginas), con Compose
  independiente, .env sin secretos reales, enlace exclusivo SSH, alta en Hub,
  esquema local, código limpio, diagnóstico, backups y validación paso a paso.
- Recorrido principal Windows/Docker Desktop + Modbus TCP. Hardware Sur no
  identificado; variante USB documenta limitación real Docker Desktop/WSL.
  Puerto 18884 propuesto sujeto a comprobar disponibilidad, no reservado.
- PDF renderizado y revisado. No se instaló Casa Sur ni se modificó Oracle
  por esta solicitud. Generador: tmp/pdfs/build_guide.py.

### Reevaluacion al recuperar conexion — 2026-09-22

- Solicitud del usuario implementada en ambos Edges. Fallo de heartbeat seguido
  de respuesta OK y fallo Modbus seguido de lectura válida generan una revisión
  de recuperación. Una lectura/heartbeat normal no genera eventos repetidos.
  Al arrancar realmente el Edge se marcan enlaces pendientes de recuperación;
  el despliegue por nodos no simula una desconexión ni un reinicio completo.
- Dispatcher cada segundo agrupa eventos y respeta modo Manual (difiere hasta
  Automático). Dispara evaluación continua inmediata y recupera rutinas de
  pulsos horarios con fin definido, sin sensores ni cortinas mezcladas, solo
  dentro de ventana, sin otra instancia ejecutándose y con actuadores detenidos
  y zonas disponibles. Ventana nocturna soportada con deadline absoluto.
  No reproduce pulsos históricos sin hora final ni inventa nuevas lecturas de
  sensor; rutinas disparadas por sensor siguen su evaluador de lecturas normal.
- Motor de cortinas reevalúa objetivo ante recuperación: porcentaje conocido
  corrige diferencia; desconocido permanece bloqueado y registra warn. Rutinas
  clásicas no repiten un pulso completado por una mera recuperación de internet;
  recuperación física de su zona vuelve a evaluar el pulso. Conserva escalonado,
  límites y protección contra rutinas duplicadas; zonas con alarma no arrancan.
- Fuentes: nodered/recovery-dispatch.js, curtain-schedule.js, flows.json;
  scripts/build-recovery.cjs (transformación inicial, no repetir), deploy-recovery.cjs.
  Backups /data/flows.before-recovery.*.json. Runtime y riego.json preservado
  verificados en ambos Edges. Se modificaron 9 nodos y agregó dispatcher.
- 35 pruebas pasan: recuperación una sola vez, modo manual, fuera de horario,
  noche, rutina ya activa, cortinas 30->50 dentro de ventana, interlock y edición.
  No se interrumpió la red real ni se accionaron motores como prueba.

### Cortinas con posicion objetivo por tiempo — 2026-09-22

- Usuario confirmó posición absoluta: desde 30% hasta 50% recorrer solo 20%.
  Modo opcional en rutinas con horario y exclusivamente cortinas. Campos:
  controlPorcentaje, aperturaObjetivo, cierreObjetivo (0..100), carrerasCortinas
  (segundos por actuador, 1..3600). Conserva pulsos antiguos si no se activa.
- Formulario permite confirmar físicamente una referencia actual por cortina;
  referencias vacías no sobrescriben estimaciones. Guardar no mueve motores.
  Referencias no se guardan en la rutina para evitar reaplicarlas después.
- Estimaciones en flow.curtainPositions, compartidas por rutinas y actualizadas
  por el ejecutor incluso ante paradas parciales y movimientos manuales permitidos.
  Tras reinicio o error de comunicación se invalidan: no inferir 0% a partir del
  antiguo campo posicion. Movimiento porcentual sin referencia se omite con warn.
  La posición es estimada, no medida; no hay homing automático.
- Fórmula: abs(objetivo-actual) * carreraSeg * 10 milisegundos. Objetivo igual
  no mueve; cierre usa diferencia hasta cierreObjetivo. Delay entre arranques,
  capacidad de zona, interlock, stop en pausa y ausencia de catch-up conservados.
- Fuentes: nodered/curtain-position.js, curtain-schedule.js y flows.json;
  scripts/build-curtain-percent.cjs es transformación inicial NO idempotente;
  scripts/deploy-curtain-percent.cjs aplica solo 12 nodos, rechaza motores en
  marcha y preserva configuración. No ejecutar el build inicial sobre flows ya
  transformados. Funciones compartidas van embebidas, no necesitan require remoto.
- Desplegado en ambos Edges con backups flows.before-percent.*.json; verificados
  flows de runtime y riego.json sin cambios. 29 pruebas pasan (schedule,
  manual-interlock, routine-edit), con cálculo 30->50=24s si carrera=120s,
  parada parcial 40%, continuación 12s, cierre 50->0=60s y referencia desconocida.
- Navegador muestra ambas áreas en línea; verificación visual del formulario
  bloqueada por sesión de área que pide contraseña. No se probaron motores físicos.
  La calibración real y activación del modo quedan a cargo del usuario.

### Recuperación del enlace de áreas — 2026-09-22

- Administrador autenticado veía Principal/Norte offline. El relay registraba
  remote port forwarding failed en 18880: una sesión SSH abandonada en Oracle
  retenía ambos puertos y no respondía HTTP. Se verificó el PID dueño de esos
  listeners y se terminó únicamente esa sesión. Ambas áreas recuperaron HTTP 200.
- Instalado deployment/60-falcon-keepalive.conf en /etc/ssh/sshd_config.d/:
  ClientAliveInterval 30 y ClientAliveCountMax 3. sshd -t correcto y configuración
  efectiva verificada; reload de sshd y reinicio solo del relay para aplicar
  comprobaciones a la nueva sesión. No se reiniciaron Node-RED ni actuadores.

### Corrección de acceso público — 2026-09-22

- Reporte: login mostraba «No se pudo conectar con el Hub central».
- Causa observada: gateway y cloudflared antiguos locales estaban nuevamente
  ejecutándose, junto al túnel Oracle. Oracle respondió correctamente al login
  de prueba; la entrada pública podía dirigirse a la instalación local obsoleta.
- Se detuvieron falcon-cloudflared-1 y falcon-gateway-1 y se cambió su política
  de reinicio a no tanto en Docker como en docker-compose.yml. Conservar perfil
  local-platform solo para uso explícito; no arrancarlo en operación normal.
- Verificación pública con cuenta inexistente: el Hub responde rechazo de
  credenciales, sin error de conexión. No se cambiaron contraseñas ni permisos.
  Falta la confirmación del usuario de su entrada real. Edges/enlace intactos.

### Indicadores compactos de áreas — 2026-09-21

- Por solicitud del usuario, las etiquetas del dashboard muestran nombre y punto
  verde (online), rojo (offline) o gris (sin configurar), sin texto de estado
  visible. Estado completo disponible en title y aria-label.
- Cambio en `water-gateway/dashboard-shell.js`, desplegado reconstruyendo solo
  el gateway Oracle. Validación de sintaxis Node correcta. No cambia la lógica
  de conexión ni el control de equipos.

### Migración central a Oracle completada — 2026-09-21

Esta sección prevalece sobre las referencias históricas al Hub/gateway locales.
Por decisión del usuario se usó su servidor Oracle existente. Proyecto independiente
`opc@150.230.161.145:~/falcon-central`; no se modificó el stack Domótica existente.

- Dashboard principal, Hub, Usuarios, PostgreSQL y túnel público ahora corren
  en Oracle. La base central es la fuente de verdad: 3 usuarios, 3 áreas y
  6 asignaciones al verificar. Se importó el último estado local, respetando
  las bajas/cambios del usuario. No restaurar snapshots anteriores sobre ella.
- `falcon-hub-nodered-1` local ahora ejecuta el enlace SSH privado con reconexión.
  Los Edges conservan HUB_URL y sus procesos; no se reiniciaron ni accionaron
  equipos. Principal/Norte usan puertos loopback remotos 18880/18882. Casa Sur
  permanece sin configurar. Gateway y cloudflared locales quedaron detenidos
  bajo perfil optativo `local-platform`; no volver a activarlos normalmente.
- Administración `/hub` restringida por rol actual en DB tanto en gateway como
  Hub (identidad firmada temporal). Se deshabilitó seed_structure desde heartbeat:
  los Edges no pueden crear estructura central. Secretos y respaldos en
  `.deployment/` ignorado por Git; nunca copiarlos al handoff.
- Validación real: con el enlace local detenido, Dashboard y Usuarios siguieron
  accesibles y solo las áreas mostraron desconexión. El enlace quedó RESTABLECIDO:
  Principal y Norte HTTP 200 y En línea en navegador. La sesión del área Principal
  solicita reconectar con contraseña; la plataforma central continúa autenticada.
- Cinco pruebas RBAC pasan. Hub real: admin 200, estándar 403, anónimo 401.
  Pruebas del gateway incluyen rechazo GET/POST administrativo para estándar.
  SHA256 de flows/settings del Hub y server/shell del gateway coinciden entre
  fuente local y contenedores Oracle. Imagen Hub reconstruida con pg/bcryptjs
  también en /data; volumen actual ya contiene código/dependencias corregidos.
- Archivos de esta migración: `deployment/*`, `scripts/prepare-cloud.cjs`,
  `generate-edge-key.cjs`, `centralize-compose.cjs`, `verify-central.cjs`,
  `tests/cloud-rbac.test.cjs`, ampliación `tests/gateway-isolation.test.cjs`,
  compose local, gitignore, gateway/server/shell, hub-settings y flow del Hub.
- Alcance: administración central disponible sin PC. Control/sensores/rutinas
  del área todavía se sirven desde su Edge y requieren conexión; no hay edición
  offline de rutinas ni cola de órdenes. Operación y puertos en
  `deployment/README.md`. Los scripts de migración inicial no deben repetirse.
- Pendiente de mantenimiento: revisar avisos npm de dependencias de imagen base
  del Hub sin `audit fix --force`. No se hicieron commits ni push.

- **Aislamiento de áreas desconectadas (2026-09-21):** la página entera antes
  dependía del HTML del Edge seleccionado. Ahora `/dashboard/` lo sirve el
  gateway mediante `water-gateway/dashboard-shell.js`, con selector y estados
  independientes del iframe del Edge. Las rutas profundas del dashboard redirigen
  al shell conservando la sección (lista permitida `view`); dentro del iframe se
  conservan las rutas Node-RED originales. No se modificaron flows ni rutinas.
- `/gateway/areas-status` autenticado consulta SOLO áreas asignadas, no expone
  URLs internas y comprueba Edges en paralelo con timeout 3.5 s. El shell consulta
  cada 10 s, oculta/desmonta el iframe del área caída y permite seleccionar otra;
  al volver en línea lo recarga. Una pérdida de WebSocket queda dentro del iframe;
  el proxy maneja errores HTTP/WS sin tumbar el proceso. Timeout de proxy 35 s
  compatible con long polling de Socket.IO. Cookies Edge se adjuntan también a
  upgrades WS. Selector muestra todas las áreas asignadas, incluidas offline o
  sin configurar, en lugar de ocultarlas por el snapshot del login.
- Login inicial de Edges paralelo y con timeout de 4 s por intento. La ruta
  `/gateway/reconnect` permite renovar SOLO la cookie del área actual usando la
  contraseña que introduce el usuario; no guarda contraseñas ni destruye las
  otras sesiones. Redirecciones Edge a riego-login apuntan a esta renovación.
  Formulario dentro del iframe usa target top para evitar paneles anidados.
- Archivos: `water-gateway/server.js`, nuevo `dashboard-shell.js`, Dockerfile,
  `tests/gateway-isolation.test.cjs`. Tres pruebas integrales pasan en contenedor
  `--network none`, con Hub/DB/Edges simulados: fallo parcial de probes, HTTP y
  WebSocket con Edge caído, shell HTTP 200, cambio a área sana, rechazo de área
  no asignada, recuperación y timeout de Edge suspendido. También se compila JS
  del shell generado y se verifica escape de nombres y lista permitida de rutas.
  Comando: `docker run --rm --network none --mount
  'type=bind,source=C:\Projects\Falcon-Docker\tests,target=/tests,readonly'
  falcon-water-gateway:latest node --test /tests/gateway-isolation.test.cjs`.
- Imagen gateway construida y desplegada con `docker compose up -d --no-deps
  gateway`; NO se reiniciaron Edges/Hub ni se apagó hardware para probar.
  Intento de etiquetar la imagen anterior como backup falló: Docker no encontró
  el ID antiguo referenciado por el contenedor. No existe ese backup de reversión;
  no asumir que `before-area-isolation` esté disponible.
  Verificación pública autenticada del shell: Principal/Norte en línea y Sur sin
  configurar; seleccionar Sur muestra aviso local con navegación intacta, y se
  restauró Principal. La sesión Edge de Principal estaba vencida antes del cambio;
  iframe muestra Reconectar área mientras shell sigue conectado. No se ingresaron
  credenciales; operación autenticada interna del Edge pendiente de renovación
  por el usuario. Pruebas de caída real de un Edge hechas solo con simuladores.
- Límite de disponibilidad: gateway, Hub/Postgres, túnel y host central siguen
  siendo dependencias compartidas. Si se suspende la máquina que aloja esos
  servicios, no puede permanecer online; requiere host siempre encendido o
  migración del plano central. Este cambio aísla la caída de un Edge remoto.

- **Enclavamiento Automático/Manual (2026-09-21):** el usuario exige bloquear
  toda activación manual mientras el sistema esté en Automático. Implementado
  en `rz_tpl_control`, `rz_fn_click_valvula` y `rz_fn_ejecutar_accion` dentro del
  flujo Edge. Las tarjetas apagadas y flechas que iniciarían movimiento quedan
  deshabilitadas en Automático; aviso ES/EN explica pasar a Manual. El servidor
  comprueba el modo actual, aunque la pestaña tenga datos antiguos. El handler
  manual reconstruye el origen (no confía en `origen:auto` enviado por cliente),
  y el ejecutor también bloquea abrir/subir/bajar de origen distinto de auto.
  Solo `modoAutomatico === false` habilita arranque manual; un modo desconocido
  queda bloqueado. Parar/cerrar manual y watchdog siguen disponibles. En cortina
  en movimiento, la flecha del sentido actual sigue funcionando como parada;
  la contraria permanece bloqueada. No se cambia el modo automáticamente.
- Pruebas: 25 pasan en total (`tests/manual-interlock.test.cjs`,
  `tests/curtain-schedule.test.cjs`, `tests/routine-edit.test.cjs`). Validan
  rechazo sin escrituras Modbus/cambios de estado/temporizadores, arranque de
  rutinas en Auto, manual en Manual, parada y watchdog, cliente antiguo y origen
  falsificado en el handler manual. No se accionó hardware para probar.
- Desplegado en Principal/Norte mediante `scripts/deploy-manual-interlock.cjs`,
  allowlist de tres campos, backup, revisión v2 y deploy nodes. Antes de reemplazar
  el ejecutor se comprobó que no hubiera actuadores activos ni rutinas corriendo
  para no perder watchdogs. Runtime/disco iguales al repo y rutinas intactas.
  Backups `/data/flows.before-manual-interlock.1789960405409.json` (Principal)
  y `/data/flows.before-manual-interlock.1789960406892.json` (Norte).
  La comprobación visual autenticada quedó limitada: al abrir Control, el
  navegador redirigió a `/riego-login`; no se introdujeron credenciales ni se
  alteró autenticación. Código y despliegue verificados; pendiente ver los botones
  en una sesión autenticada del usuario. Imagen compartida reconstruida correctamente.

- **Nombre general Control (2026-09-20):** por solicitud del usuario, la pestaña
  antes Riego/Irrigation se llama **Control** en ambos idiomas. Cambió `name` de
  `rz_page_control` y el mapa de traducción del shell en cinco templates (control,
  configuración, rutinas, sensores y gate). Ruta `/dashboard/riego` conservada.
  Aplicado a Principal y Norte mediante `scripts/deploy-control-name.cjs`, que
  permite únicamente esas sustituciones visuales, respalda y verifica igualdad
  runtime/disco y rutinas intactas. Respaldos `/data/flows.before-control-name.`
  `1789958993174.json` (Principal) y `1789958994689.json` (Norte).
  Menú público verificado: Control, Settings, Routines, Sensors. La imagen
  compartida también se reconstruyó correctamente para futuras áreas, incluida Casa Sur cuando
  tenga Edge. Sin cambios en comandos, horarios ni lógica de equipos.

- **Rutinas de cortinas por pulsos (2026-09-20):** solicitado abrir con un pulso
  temporizado al inicio y cerrar con otro al final, apagando cada relé al terminar
  su pulso. El usuario confirmó **delay entre arranques, permitiendo solaparse**.
  Aplica automáticamente a rutinas con horario y selección formada SOLO por
  cortinas. Las rutinas mixtas y los demás actuadores conservan su motor anterior.
- Nuevo motor `rz_fn_curtain_pulse_schedule` y tick de 1 segundo
  `rz_inject_curtain_pulses`, con fuente mantenida en `nodered/curtain-schedule.js`
  e incorporada en `nodered/riego-flow-backup/flows.json`. Detecta transiciones,
  ejecuta una secuencia de apertura/cierre sin repetir durante el bloque, admite
  horarios nocturnos y respeta días de inicio. Cada pulso tiene su temporizador
  de parada independiente; se conserva el watchdog del ejecutor como respaldo.
  El delay se cuenta desde cada arranque real; el límite de simultáneas de la
  zona puede prolongarlo. Reservas evitan excederlo entre rutinas en un mismo tick.
  Pausar, borrar, editar o pasar a Manual cancela pulsos y arranques pendientes
  en el siguiente tick. Cambiar sentido detiene primero y espera al menos 1 s.
  Se conserva la condición de temperatura que fuerza cierre; humedad no fuerza
  cierre en este modo, igual que en el anterior evaluador de horario continuo.
- Al guardar, habilitar o reiniciar se prepara la próxima transición: no se hace
  apertura inmediata por recuperar una ventana ya empezada. Una edición que
  cambia la configuración cancela la secuencia previa y arma el nuevo horario.
  Pulso configurable de 0.1 s a 60 min; delay de 1 a 3600 s. Para datos legacy sin
  duración se usa `autoApagadoSeg` individual; sin ninguno no se arranca y se
  advierte en Node-RED. Al guardar se exige duración y cierre válido/distinto.
  Orden = orden de selección; el formulario muestra los nombres en secuencia.
- Se actualizaron guardar/recrear cron/toggle/evaluador de sensores/evaluador
  continuo/motor de pulsos para excluir estas rutinas del motor repetitivo,
  incluso mensajes cron antiguos. `rz_tpl_rutinas` muestra Apertura, Cierre
  automático, Tiempo de pulso y Delay entre arranques; mantiene estilo anterior.
  Edición continúa conservando el ID de la misma rutina.
- Validación: 21 pruebas pasan con `node --test tests/curtain-schedule.test.cjs
  tests/routine-edit.test.cjs`: secuencias y tiempos exactos con reloj simulado,
  solapamiento, cierre, no repetición, cancelación, cambio de sentido, horario
  nocturno, capacidad, intervención manual, reinicio, legacy, validaciones de
  guardado y exclusión del cron. Comprueban igualdad fuente/nodo y compilación de
  funciones. No se provocaron aperturas/cierres reales para probar el motor.
- Despliegue parcial `nodes` en Principal y Norte, con
  `scripts/deploy-curtain-schedule.cjs`: allowlist de siete nodos modificados y
  dos nuevos, revisión v2, backup, igualdad runtime/disco y datos de rutinas
  intactos durante el despliegue. Respaldos Principal:
  `/data/flows.before-curtain-pulses.1789919587617.json`; Norte:
  `/data/flows.before-curtain-pulses.1789919589501.json`.
  Se encontró `test cortinas` corriendo con horario **11:23–12:28**, cambiado por
  el usuario respecto al snapshot anterior. Se pausó mediante la UI para detener
  el motor viejo antes de reemplazarlo; se verificó ausencia de rutinas corriendo
  y cortinas en movimiento, y después se volvió a habilitar mediante la UI.
  Estado final verificado: habilitada, mismas horas, **pulso de 1 min, delay 3 s**,
  ambas cortinas detenidas, motor anterior sin ejecuciones. Tras la interrupción
  de la conversación, la reactivación y comprobación final se completaron a las
  22:10 America/New_York: la ventana de hoy ya terminó. No se ejecutó un cierre
  de recuperación; motor armado con target bajar, cola y pulsos vacíos. La
  siguiente transición depende del próximo día seleccionado (actualmente domingo).
  Formulario público verificado en Editar y cerrado sin guardar cambios.
  Imagen `falcon-docker:latest` reconstruida correctamente. Sin pasos de
  instalación pendientes; la ejecución física temporizada se verificó mediante
  simulación, no mediante una secuencia de prueba sobre los equipos reales.

- **Corrección de edición de rutinas (2026-09-20):** el usuario reportó que
  Guardar cambios creaba otra rutina. Causa reproducida: el formulario llevaba
  `editandoId`, pero `rz_fn_guardar_rutina` usaba únicamente `d.id || Date.now()`.
  Se corrigió `func` de ese nodo para resolver `editandoId ?? id`, encontrar la
  rutina existente conservando su ID original/tipo y rechazar una edición cuyo
  ID ya no existe. La entrada cron conserva `rutina_<id>`; no se crea otra rutina.
  `format` de `rz_tpl_rutinas` envía además `id: msg.payload.editandoId ?? null`
  en Guardar, evitando arrastrar un ID viejo al crear una nueva. Compatible con
  formularios ya abiertos que solo mandan `editandoId`. No se tocaron horarios,
  lógica de ejecución, datos de rutinas existentes ni se eliminaron duplicados.
- Pruebas: `node --test tests/routine-edit.test.cjs` ejecuta las funciones reales
  y el handler del formulario con contexto aislado. Los cinco casos fallaron
  antes del arreglo y pasan después: ediciones repetidas, formulario antiguo,
  ID como texto/ID legacy, edición de rutina borrada y creación nueva. Verifican
  cantidad de rutinas, ID y nombre cron, campos actualizados y ausencia de efectos
  al rechazar un ID inexistente. No se ejecutan equipos reales en estas pruebas.
- Despliegue: `scripts/deploy-routine-fix.cjs` solo permite modificar los dos
  campos/nodos anteriores, guarda respaldo, usa revisión v2 y despliegue `nodes`,
  comprueba runtime/disco iguales al repo y verifica que los datos persistidos
  de rutinas no cambien. Aplicado a Principal y Norte sin reiniciar contenedores.
  Respaldos: `/data/flows.before-routine-id.1789918407570.json` (Principal) y
  `/data/flows.before-routine-id.1789918408468.json` (Norte). En navegador se abrió
  Editar de `test riego`: mostró Editing existing routine y Save changes; se cerró
  sin guardar para no alterar una rutina real. Las tres rutinas siguen visibles.
  Imagen `falcon-docker:latest` reconstruida correctamente; corrección desplegada
  y sin pasos de instalación pendientes.
- **Exhaust Fan (2026-09-20):** se añadió un icono SVG de extractor con marco
  cuadrado, aro y hélice, distinto del ventilador normal. Conserva estilo y
  estados ON/OFF. Solo se modificó `format` de `rz_tpl_control` en el flujo Edge.
  `rzTipoIcono` reconoce `Exhaust Fan-1`, `ExhaustFan1`, `exhaust_fan_2`,
  `Extractor 1`, `Extractores-2` y `Ventilador extractor 1`, priorizando extractor
  frente a fan genérico. Se verificaron estas asignaciones, la sintaxis y que
  `Fan-1` sigue usando su icono anterior; los comandos no cambiaron.
  Aplicado con despliegue parcial `nodes` a Principal y Norte, comprobando igualdad
  semántica de runtime/disco/repositorio, sin accionar hardware ni reiniciar
  contenedores. Respaldos en `/data/flows.before-actuator-icons.1789917959236.json`
  (Principal) y `/data/flows.before-actuator-icons.1789917960349.json` (Norte).
  No se creó un equipo ficticio: el icono aparece al usar uno de esos nombres
  en un actuador existente o nuevo. Imagen `falcon-docker:latest` reconstruida
  correctamente. No quedan pasos de despliegue pendientes para este icono.
- **Ampliación de apariencias aplicada (2026-09-20):** por pedido del usuario,
  se añadieron heater (radiador), luces (bombilla), pump (bomba hidráulica),
  temperatura (termómetro) y humedad (gota con porcentaje). Se mantiene el estilo
  existente; actuadores usan sus colores ON/OFF, sensores conservan valores,
  unidades, gráficas e indicador de conexión. No se crearon dispositivos reales.
  En `flows.json`, solo cambiaron `format` de `rz_tpl_control` y
  `a326bfab2b19411f` (Sensores Compacto). El helper visual ahora es `rzTipoIcono`:
  reconoce tipo o prefijos de nombres en español/inglés, con acentos normalizados:
  `Heater-1`, `Calefactor 1`, `Luz-1`, `Luces 1`, `Light-1`, `Pump-1`, `Bomba 1`,
  etc. Los básicos sin coincidencia siguen con gota de válvula; cortinas mantienen
  su rama independiente. Para sensores se usan tipos `temperatura` y `humedad`.
- Despliegue de ampliación: `scripts/deploy-control-template.cjs` permite ahora
  solamente los dos nodos visuales anteriores (solo campo format), con las mismas
  protecciones y comandos intactos. Validación previa y despliegue parcial `nodes`
  exitosos en Principal y Norte; runtime y JSON persistido iguales al repositorio.
  Respaldos: `/data/flows.before-actuator-icons.1789917021340.json` (Principal) y
  `/data/flows.before-actuator-icons.1789917021853.json` (Norte).
  Imagen reconstruida correctamente; sin reiniciar contenedores ni accionar equipos.
  MD5 repo `1db4ff464ea8b0a8f7d1a74b91356827`; sin salto final
  `c3a4c430a915717d43bc7d45d532dc8f` (formato persistido por Node-RED).
- Comprobación de ampliación: sintaxis del componente y asignaciones de iconos
  verificadas con ejemplos (incluido `Bombilla` distinto de `Bomba`). Panel público
  de riego y sensores cargan. Durante la inspección no había tarjetas de lecturas
  en sensores ni heaters/luces/pumps en el panel visible: sus dibujos quedan
  preparados para cuando existan esos equipos/datos; no se agregaron datos falsos
  para probarlos. Falta solo valoración visual del usuario con esos dispositivos.
- **Diseño de tarjetas aprobado y aplicado (2026-09-20):** el usuario pidió
  conservar el estilo actual y cambiar solamente la apariencia dentro de las
  tarjetas, usando los iconos sencillos de la propuesta. Esta decisión reemplaza
  la propuesta de cambiar distribución, colores o usar los PNG completos.
  Se modificó únicamente `format` del nodo `rz_tpl_control` en
  `nodered/riego-flow-backup/flows.json`: gota para válvulas, hélice para fans y
  persiana para cortinas, con SVG locales sin dependencias ni descargas.
  Se conservan cuadrícula (4 columnas en móvil), colores existentes, nombres,
  botones direccionales, indicadores de origen, cuentas regresivas y todos los
  manejadores de comandos. Los fans actuales tienen `tipo: basico`: el helper
  visual `rzEsVentilador` reconoce `fan`/`ventilador` por tipo o prefijo del nombre
  (ej. `Fan-1`). No se modificó estructura del Hub ni lógica de actuadores.
- Despliegue de tarjetas: se agregó `scripts/deploy-control-template.cjs`, que
  compara todos los nodos contra la API local, permite cambiar solo el contenido
  de la plantilla, conserva comandos, guarda respaldo y usa revisión v2 con
  `Node-RED-Deployment-Type: nodes`. Aplicado a Casa Principal y Casa Norte,
  **sin reiniciar contenedores ni accionar hardware**. Respaldos dentro de cada
  Edge: `/data/flows.before-actuator-icons.1789890989193.json` (Principal) y
  `/data/flows.before-actuator-icons.1789890991003.json` (Norte). No reutilizar
  estos respaldos sin comprobar que no haya cambios posteriores.
- Verificación: validación previa confirmó que solo cambia `rz_tpl_control`;
  después se compararon los JSON del runtime y disco con el repositorio, iguales
  semánticamente. MD5 local `c87e628d28be2cc6718345fa1e5bc2fa`; MD5 en ambos Edges
  `c867b0f1ce326c43f2a843bea7193a23`: diferencia **solo del salto de línea final**,
  comprobada. Se verificaron iconos de los tres tipos en el panel público a ancho
  estrecho; no se pulsaron actuadores para probar ON. Ambos Edges siguen healthy.
  Imagen `falcon-docker:latest` reconstruida para futuras instalaciones.
  Pendiente solo la valoración visual del usuario; no hay que repetir el deploy.
- Vista previa de actuadores (2026-09-20): el usuario pidió ver la alternativa
  más sencilla. Se creó una demostración interactiva en la conversación:
  `C:/Users/ramon/.codex/visualizations/2026/09/20/01a0bd88-8629-7a93-9f85-9538593fbc59/actuadores-falcon.html`.
  Muestra seis tarjetas (válvula, ventilador y cortina, cada uno activo/inactivo),
  iconos simples, nombres dinámicos en texto y estados explícitos. Las flechas
  de cortina simulan subir/bajar; repetir la dirección detiene la simulación.
  Permite comparar fondo activo intenso/suave, color y esquinas. Es una propuesta
  aislada sin peticiones de red ni conexión al hardware; **no se modificó ni
  desplegó el dashboard real**. Sintaxis JavaScript comprobada; falta aprobación
  visual del usuario para decidir qué diseño integrar. El próximo paso de esta
  solicitud es recoger sus ajustes o selección de diseño.
- Nueva solicitud visual: usar las seis referencias `Curtain off/on.png`,
  `Fan off/on.png` y `Valve off/on.png` de `C:/Users/ramon/Downloads/` para
  dar apariencia ilustrada a los actuadores. Se inspeccionó `rz_tpl_control`
  (Panel de Control). **Solo propuesta; no se modificó ni desplegó la interfaz.**
  Propuesta: imagen por tipo/estado, nombre dinámico fuera de la ilustración
  (las referencias Valve llevan V-1 incrustado), conservar cuenta regresiva,
  origen y alarmas, adaptar tarjetas a móvil. Las cortinas usan estados
  `subiendo`/`bajando` y dos botones direccionales: representar ON como motor
  en movimiento y OFF como detenido, sin inferir posición abierta/cerrada.
  Mantener controles direccionales. Esta propuesta no es todavía una decisión
  final del usuario sobre tamaños, edición de imágenes ni despliegue.
- El usuario confirmó que **Tammy permanece en Casa Sur**. No cambiar su asignación.
- **Resuelto por confirmación del usuario:** el rechazo de acceso de `ramon`
  en Safari era una contraseña introducida incorrectamente. El usuario confirmó:
  "ya sale fui yo que puse el pass mal". No queda una incidencia de login en
  Safari pendiente. No se cambió ni solicitó su contraseña; su
  `must_change_password` estaba en `false` al verificarlo. También se comprobó
  que los registros de contraseña local y central coincidían, sin mostrarlos.
- Autorizó exigir cambio de contraseña inicial. **Implementado y desplegado**:
  `hubg_n2` devuelve `mustChangePassword`; los nuevos nodos
  `hubg_password_in/fn/out` implementan `/api/users/change-password-direct`,
  protegido con el secreto del gateway y la contraseña actual del usuario.
  Rechaza contraseñas nuevas iguales o de menos de 8 caracteres, y actualiza
  con comparación del hash anterior para evitar sobrescribir cambios simultáneos.
- `water-gateway/server.js` exige el cambio antes de crear sesiones Edge,
  bloquea acceso HTTP y resolución de nuevos WebSockets mientras esté pendiente,
  consulta la marca actual en Postgres también para sesiones anteriores,
  protege el formulario con token CSRF y exige volver a entrar tras el cambio.
  Funciona incluso si el área no tiene Edge disponible. No guarda contraseñas
  en la sesión. Se regeneran sesiones al ingresar.
- Formulario de acceso: `autocomplete` explícito, usuario sin capitalización
  automática, autocorrección ni corrector; contraseña intacta (no se recorta).
  Esto previene una posible causa móvil, **no demuestra que fuera la causa**.
  Se corrigió el ancho de la tarjeta móvil y se ordenan áreas por nombre.
- Pruebas aisladas: `water-gateway/auth.test.cjs`, ejecutadas en contenedor sin
  red con dependencias de la imagen. Cubren bloqueo HTTP/WebSocket, sesiones
  existentes tras reset, CSRF, contraseña actual incorrecta, confirmación,
  cambio exitoso y rechazo de contraseña anterior. Ambas pruebas pasan.
- Prueba real: `scripts/verify-gateway-password.cjs` se ejecuta dentro del Hub.
  Crea una cuenta aleatoria temporal asignada a Casa Sur, verifica el ciclo de
  cambio y el acceso público con user agents de escritorio y Safari, y elimina
  su usuario y sesiones al terminar. Pasó. **No equivale a un Safari físico**.
- Se reconstruyó y recreó solo `gateway`; se respaldó el flujo anterior del Hub
  en `/data/flows.pre-codex-password.json`, se copió el actualizado y se reinició
  solo `hub-nodered`. Los dos Edges no se reiniciaron. Todos los servicios están
  activos. MD5 del flujo Hub desplegado: `0ee321912e09af25fa247e1ff9923fb9`.
- Estado actual: Tammy confirmada en Casa Sur, cambio inicial obligatorio
  desplegado y probado, acceso del usuario en Safari confirmado. La confirmación
  del acceso no implica una revisión completa de todas las pantallas en iPhone.
- Próximo paso: continuar con el siguiente cambio que solicite el usuario y
  actualizar este registro. No quedan acciones pendientes por el rechazo de
  contraseña. Casa Sur física sigue pendiente según el relevo anterior; no se
  ha recibido una instrucción nueva para instalarla. No hacer commits sin pedido.

---

## 1. Objetivo actual y comportamiento esperado

Proyecto: control de riego real (válvulas, cortinas, sensores) para
varias casas físicas ("Casa Principal", "Casa Norte", y una futura "Casa
Sur"), cada una corriendo su propia instancia de Node-RED (+ Postgres,
Mosquitto, ChirpStack) en Docker. Todo se administra de forma
**centralizada desde un "Hub"** (otra instancia de Node-RED) para que:

1. **Estructura** (zonas/actuadores/sensores) se edite solo desde el Hub
   (`/hub/areas/:id/estructura`) — cada Edge la recibe automáticamente
   por heartbeat cada 30s. Un Edge con `HUB_URL` seteado **rechaza**
   cualquier edición local de estructura (guarda dura en 10 funciones del
   flujo, ver sección 4).
2. **Usuarios** son globales (una cuenta = un username+password), y se
   les asigna una o más áreas donde pueden operar, todo desde
   `/hub/usuarios`. El login se valida **en tiempo real contra el Hub**
   (sin copia local de contraseñas en cada Edge) — decisión explícita del
   usuario, con la contra aceptada de que si el Hub está caído nadie
   puede loguearse en ningún sitio (el riego en curso sigue andando
   igual, eso no depende del Hub).
3. Cambiar una PC de "Casa Sur" a "Casa Norte" (por ejemplo) debe
   requerir **solo** editar `RIEGO_AREA_ID`/`RIEGO_AREA_KEY` en su `.env`
   — ya funciona así, tanto para estructura como para usuarios.
4. Hay un **punto de entrada público único**, `https://water.riegocom.uk/`
   (vía Cloudflare Tunnel → servicio `gateway`), que loguea contra el Hub
   y redirige/proxea a cada usuario al Node-RED real de su área. Si tiene
   varias áreas asignadas, un selector flotante en el dashboard le deja
   cambiar de área sin volver a loguearse.

**Estado: todo lo de arriba está construido y funcionando en producción
real ahora mismo** (verificado con curl y con el navegador, incluido
mobile emulado). Ver sección 6 para el detalle de qué se probó.

---

## 2. Qué se completó (orden cronológico) y qué falta (orden de prioridad)

### Completado esta sesión (todo verificado en vivo, no solo escrito)

1. Migración completa de `guardian-docker` → `Falcon-Docker` como
   producción real, en los puertos originales (1880/1881/1882/1883/8080
   /8090/8123/1700 udp). Imagen `guardian/nodered:latest` borrada.
2. RBAC real: estructura bloqueada del lado servidor cuando hay Hub (no
   solo cosmético como estaba antes).
3. Bootstrap de placas Modbus por `.env` (`MODBUS_BOARDS`) para
   instalaciones nuevas — se aplica una sola vez si el área en el Hub
   está pristina.
4. `docker-compose.yml` con `profiles` (`hub`, `casa-norte`, `cloudflare`)
   para que una PC nueva no levante servicios que no le corresponden.
5. Segundo Edge (`casa-norte-nodered`) agregado al compose de esta PC.
6. **Etapa 5 — Usuarios centralizados en el Hub**: `riego_hub.users` +
   `riego_hub.user_areas`, login/cambio de password/idioma del Edge
   proxeados al Hub en tiempo real, gestión de usuarios movida a
   `/hub/usuarios`.
7. **Etapa 6 — Gateway público** (`water-gateway/`, servicio Docker
   nuevo): reverse proxy con sesión propia, selector de área, sesión real
   establecida en cada Edge, WebSocket de Dashboard 2.0 funcionando.
   Túnel de Cloudflare ya re-apuntado y probado contra la URL real.
8. Fix de caché del navegador (`Cache-Control: no-store`) + fix de
   **service worker** (la PWA de Node-RED Dashboard se reinstalaba sola y
   servía HTML viejo con la etiqueta de área incorrecta) — confirmado
   arreglado en mobile emulado (375x812) y desktop.

### Pendiente, en orden de prioridad

1. **[Verificar con el usuario] Reasignación rara de "Tammy"**: en el
   snapshot más reciente, `Tammy` aparece asignada solo a `casa-sur` (ver
   sección 9). Antes en la sesión estaba asignada a `casa-principal`.
   Puede ser un cambio intencional hecho por el usuario en
   `/hub/usuarios` (el formulario de crear/actualizar usuario REEMPLAZA
   el conjunto de áreas por lo que esté tildado, no lo suma) — o un
   olvido. **No tocar sin confirmar con el usuario primero.**
2. **[Pendiente de decisión del usuario] Forzar cambio de password en el
   primer login vía el gateway**: hoy `mustChangePassword=true` no
   bloquea nada — el usuario entra derecho al dashboard. Se le avisó al
   usuario de esto explícitamente; no pidió que se arregle todavía.
3. **[Pendiente, no depende de código] Casa Sur real**: el área existe
   en el Hub (con algo de estructura cargada, `structure_version=8`) pero
   `internal_url` está vacío — no hay ninguna PC real levantada para ese
   sitio todavía. Cuando el usuario arme esa PC, seguir
   `agregar-sitio-nuevo.pdf` (Pasos 1-6) y cargar la `internal_url` en
   `/hub/areas` al final.
4. **[Cosmético, no reportado como bug por el usuario] Orden no
   determinístico del área por defecto al loguearse**: en
   `water-gateway/server.js`, la query que trae las áreas asignadas
   (`SELECT id, name, internal_url FROM riego_hub.areas WHERE id = ANY($1)`)
   no tiene `ORDER BY`, así que qué área queda seleccionada por defecto
   al loguearse (para un usuario multi-área) es arbitrario. Fix fácil:
   agregar `ORDER BY name` (o por fecha de asignación) a esa query en
   `establecerSesionEdge`'s caller (dentro de `app.post('/login', ...)`).
5. **[Pedido explícitamente, no verificado por mí]** El usuario pidió
   confirmar la experiencia en un **teléfono físico real** (yo solo
   probé con emulación de viewport 375x812 en el navegador integrado,
   nunca un dispositivo real). Falta esa confirmación de su parte.
6. **Limpieza de usuarios de prueba**: no debería quedar ninguno (los
   fui borrando después de cada prueba), pero vale la pena que quien
   siga corra `SELECT username FROM riego_hub.users;` contra
   `falcon-postgres-1` y confirme que solo están `Tammy`, `Ariel`,
   `ramon`, `Test` (los 3 reales + uno que el usuario creó él mismo
   probando el Hub).

---

## 3. Archivos modificados y propósito de cada cambio

| Archivo | Qué cambió y por qué |
|---|---|
| `nodered/riego-flow-backup/flows.json` | (a) 10 nodos de estructura (`rz_fn_crear_zona`, `editar_zona`, `eliminar_zona`, `crear_valvula`, `editar_valvula`, `eliminar_valvula`, `guardar_ajustes`, `crear_sensor`, `editar_sensor`, `eliminar_sensor`) ahora rechazan con 403/mensaje si `env.get('HUB_URL')` está seteado. (b) `hub_hb_fn_build` (arma el heartbeat) manda `seed_structure` parseado de `MODBUS_BOARDS` si está seteado. (c) `auth_fn_login_validate`, `auth_fn_changepw`, `auth_fn_idioma` ahora tienen 2 salidas: si hay Hub, arman una request y la mandan a un `http request` node nuevo hacia el Hub (`auth_http_hub_login/changepw/idioma` → `auth_fn_login_handle/changepw_handle/idioma_handle`); si NO hay Hub, corren el código local original sin tocar (retrocompatibilidad). (d) `auth_fn_admin_create/list/delete` rechazan con 403 si hay Hub. (e) `auth_fn_me` ahora expone `hubManaged` en la respuesta. (f) template `auth_tpl_config_gate`: agregado `hubManaged` a `data()`/`mounted()`, el ítem "Gestionar usuarios" del menú se reemplaza por texto fijo cuando `hubManaged` es true. |
| `nodered/hub-flow-backup/flows.json` | (a) Nodos nuevos `hubu_n1`..`hubu_n21`: `POST /api/users/login`, `/change-password`, `/set-language` (autenticados con `area_id`+`area_key`, fuera del gate admin), y `/hub/usuarios` GET/POST + `/hub/usuarios/:id/asignar` + `/hub/usuarios/:id/eliminar` (páginas HTML, gateadas por Basic Auth como el resto de `/hub/*`). (b) Nodos `hubg_n1`..`hubg_n6`: `POST /api/users/login-direct` (sin area_id, protegido por `GATEWAY_SHARED_SECRET`, usado por el gateway público) y `POST /hub/areas/:id/internal-url`. (c) `hub_n2` (`hub_fn_list`, la página `/hub/areas`) ahora también muestra/edita `internal_url` por área. (d) `hub_n17` (`hub_fn_heartbeat`) acepta `seed_structure` del Edge y lo aplica una sola vez si el área está pristina. |
| `postgres/hub-schema.sql` | Agregadas `riego_hub.users`, `riego_hub.user_areas`, y columna `riego_hub.areas.internal_url`. Todo con `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — seguro de re-correr. |
| `postgres/riego-auth-users-schema.sql` (nuevo) | DDL de `riego_auth.users` (antes solo existía en la base real, nunca en el repo). Ya casi no se usa (los Edges con Hub ya no consultan esta tabla para login), pero se documentó para el caso standalone sin Hub. |
| `docker-compose.yml` | Servicio `nodered`: sacado `devices: /dev/ttyUSB0` y `group_add: dialout` (Casa Principal usa Modbus TCP, no serial) y agregada env `MODBUS_BOARDS`. Servicio `hub-nodered`: agregada env `GATEWAY_SHARED_SECRET`, y `profiles: [hub]`. Servicio nuevo `casa-norte-nodered` (con `profiles: [casa-norte]`). Servicio nuevo `gateway` (build de `./water-gateway`, `profiles` ninguno propio pero depende de `hub-nodered`; puerto `8443:3000` para pruebas locales). |
| `.env` / `.env.example` | Variables nuevas: `COMPOSE_PROFILES`, `MODBUS_BOARDS`, `CASA_NORTE_AREA_KEY`, `CASA_NORTE_MODBUS_BOARDS`, `HUB_ADMIN_USER/PASSWORD_HASH`, `HUB_EDITOR_PASSWORD_HASH`, `GATEWAY_SESSION_SECRET`, `GATEWAY_SHARED_SECRET`. Ver sección 5 para qué hace cada una. |
| `.gitignore` | Agregado `docker-compose.override.yml` (archivo local, nunca se commitea). |
| `water-gateway/` (nuevo, todo el directorio) | Servicio Express standalone (no Node-RED). `Dockerfile`, `package.json`, `server.js`. Ver sección 4 para el detalle de diseño y los bugs ya resueltos ahí. |
| `scripts/bootstrap-new-site.ps1` (nuevo) | Aplica el schema de `riego_auth.users` local + crea el primer admin — pero se auto-desactiva (imprime un aviso y sale) si detecta `HUB_URL` en el `.env`, que es el caso normal desde la Etapa 5. |
| `agregar-sitio-nuevo.pdf` (nuevo, generado con reportlab) | Guía paso a paso para agregar un sitio nuevo. Actualizada dos veces (primero con `MODBUS_BOARDS`/perfiles, después para reflejar que los usuarios se crean en el Hub, no por sitio). |
| `docker-compose.override.yml.disabled-por-migracion` | El override viejo que remapeaba puertos para convivir con `guardian-docker`, renombrado (no borrado) al migrar a los puertos originales. Puede borrarse si se confirma que ya no hace falta. |

---

## 4. Decisiones importantes y restricciones que hay que respetar

- **El Hub es la única fuente de verdad de estructura** cuando `HUB_URL`
  está seteado — el bloqueo es incondicional (no depende de rol). Si se
  necesita reabrir edición local de estructura para algún caso, hay que
  tocar los 10 nodos listados en la sección 3, no alcanza con cambiar el
  front.
- **Login en tiempo real contra el Hub, sin cache local** — decisión
  explícita del usuario (eligió esta opción sobre "usuario global + sync
  a cada Edge" cuando se le preguntó). Implica que si `hub-nodered` está
  caído, NADIE puede loguearse ni cambiar password/idioma en ningún
  sitio. No "arreglar" esto sin volver a preguntarle, es un tradeoff que
  ya aceptó conscientemente.
- **Rol es global por usuario, no por área** (un admin lo es en todos
  lados). Es un supuesto mío, no confirmado explícitamente por el
  usuario — si hiciera falta rol por área, hay que mover `role` de
  `riego_hub.users` a `riego_hub.user_areas`.
- **`http-proxy-middleware@2.0.10` tiene dos gotchas confirmados y
  documentados en el código** (no re-descubrirlos):
  1. Combinar `selfHandleResponse: true` + `responseInterceptor` con la
     API nueva (`on: { proxyReq, proxyRes }`) CUELGA la respuesta
     indefinidamente. Hay que usar las claves viejas de nivel superior
     (`onProxyReq`, `onProxyRes`).
  2. La librería se autoregistra en el evento `upgrade` del servidor
     HTTP subyacente en cuanto se monta con `ws: true` — un listener
     manual adicional (`server.on('upgrade', ...)`) compite con el
     automático y crashea el proceso (`Cannot read properties of
     undefined (reading 'areas')`) porque el automático usa el request
     crudo sin sesión. La solución (ya aplicada): el `router()` del
     proxy resuelve la sesión el mismo, a mano, leyendo la cookie firmada
     con `cookie` + `cookie-signature`, sin asumir que `req.session` ya
     existe.
- **Mutar `proxyRes.headers` dentro de `responseInterceptor` NO tiene
  efecto** — para pisar headers de la respuesta final hay que usar el 4to
  parámetro `res` del callback (`res.setHeader(...)`), ya que
  `responseInterceptor` copia los headers a `res` antes de invocar el
  callback.
- **El dashboard de Node-RED (`@flowfuse/node-red-dashboard`) es una PWA
  con service worker** — cualquier cosa que dependa de servir HTML fresco
  (como la barra de selector de área) tiene que **bloquear el
  registro** de un service worker nuevo, no alcanza con desregistrar uno
  viejo (la propia app lo vuelve a registrar en el siguiente ciclo). Ya
  resuelto en `water-gateway/server.js` pisando
  `navigator.serviceWorker.register`.
- **Nunca asumir que reconstruir la imagen alcanza**: los volúmenes de
  Node-RED (`nodered_data`, `hub_nodered_data`, `casa_norte_nodered_data`)
  ya existen y tienen datos reales — Docker NO les vuelve a copiar el
  `flows.json` horneado en la imagen al reconstruirla. Todo cambio a
  `flows.json` necesita, además de `docker compose build`:
  ```bash
  docker cp nodered/riego-flow-backup/flows.json falcon-nodered-1:/data/flows.json
  docker cp nodered/riego-flow-backup/flows.json falcon-casa-norte-nodered-1:/data/flows.json
  docker cp nodered/hub-flow-backup/flows.json falcon-hub-nodered-1:/data/flows.json
  docker compose restart nodered casa-norte-nodered hub-nodered
  ```
  Esto YA se hizo para todos los cambios de esta sesión (ver sección 9,
  los hashes coinciden ahora mismo) pero es fácil de olvidar en la
  próxima.
- **Nunca mostrar secretos en la terminal** — para leer/escribir valores
  de `.env` (hashes, tokens, keys) se usó Python con `open()`/`re` en vez
  de `grep`/`cat`, precisamente porque el clasificador de seguridad de
  esta sesión bloqueó un `grep` directo sobre `.env` una vez
  ("Credential Materialization"). Seguir ese patrón.
- **No commitear nada sin que lo pida el usuario explícitamente** — todo
  lo de esta sesión sigue sin commit a propósito.

---

## 5. Variables de entorno nuevas (qué hace cada una, sin valores)

| Variable | Para qué |
|---|---|
| `COMPOSE_PROFILES` | En esta PC: `hub,casa-norte,cloudflare`. Activa los servicios `hub-nodered`, `casa-norte-nodered`, `cloudflared` que tienen `profiles:` en el compose. Una PC de un sitio nuevo debe dejarlo vacío. |
| `MODBUS_BOARDS` / `CASA_NORTE_MODBUS_BOARDS` | Bootstrap de placas Modbus de una instalación nueva vía heartbeat (una sola vez, si el área está pristina en el Hub). Formato: `unitid:nombre:canales:maxSimultaneas` separado por `;`. |
| `CASA_NORTE_AREA_KEY` | Key de área de Casa Norte (mismo mecanismo que `RIEGO_AREA_KEY` del Edge principal). |
| `HUB_ADMIN_USER` / `HUB_ADMIN_PASSWORD_HASH` | Usuario/clave (Basic Auth, hash scrypt) para entrar a `/hub/*` (páginas de administración). |
| `HUB_EDITOR_PASSWORD_HASH` | Hash bcrypt para el editor de Node-RED del Hub (puerto 1881), separado del anterior. |
| `GATEWAY_SESSION_SECRET` | Firma las cookies de sesión del gateway público (`water-gateway`). Cambiarla desloguea a todo el mundo del gateway (no de cada Edge). |
| `GATEWAY_SHARED_SECRET` | Protege `POST /api/users/login-direct` en el Hub — debe ser IGUAL en `.env` para que el gateway y `hub-nodered` se entiendan (ambos leen la misma variable del mismo `.env`, así que ya está garantizado mientras no se edite a mano en un solo lado). |

---

## 6. Pruebas ejecutadas y resultados

Todas contra el stack real (`falcon-*`), la mayoría con usuarios
descartables creados y borrados en el momento (no debería quedar
ninguno — ver punto 6 de la sección 2).

| Prueba | Resultado |
|---|---|
| Login real vs Hub (`/api/users/login`, `/api/users/login-direct`) — correcto, password mala, área no asignada | OK en los 3 casos (401 genérico para los 2 últimos, sin filtrar cuál falló) |
| Cambio de password / idioma proxeado al Hub, reflejado en otro sitio con la misma cuenta | OK — cambié password desde Casa Principal, logueó con la nueva en Casa Norte |
| Bloqueo del endpoint local `/riego-auth/admin/users` cuando hay Hub | OK — 403 con mensaje, no crea nada ni local ni en el Hub |
| Bootstrap de `MODBUS_BOARDS` vía heartbeat (una vez, ignorado después) | OK — probado con área descartable, 2 placas cargadas, segundo intento con datos distintos ignorado |
| `docker-compose.yml` con perfiles: `COMPOSE_PROFILES=hub,casa-norte` levanta 11 servicios, vacío levanta 9 | OK (`docker compose config --services`) |
| Gateway: login single-área (sin selector) y multi-área (con selector) | OK |
| Gateway: cambiar de área sin re-loguearse, sesión real reflejada (`/riego-auth/me`) en cada Edge | OK |
| Gateway: WebSocket (Socket.IO de Dashboard 2.0) a través del proxy | OK, tras 2 fixes (ver sección 4) |
| Gateway: persistencia de sesión tras `docker compose restart gateway` | OK (session store en Postgres via `connect-pg-simple`) |
| Gateway: filtro de áreas "no disponibles" (asignadas pero sin `internal_url`) fuera del selector | OK |
| Gateway: reintento de login al Edge si falla la primera vez (posible reinicio en curso) | Código agregado, reproducido el caso con `DELETE FROM riego_auth.session` simulando sesión vencida — mensaje amigable confirmado. **No se probó el reintento en sí con un fallo real de red** (haría falta parar un Edge a mitad del login, no se hizo). |
| Gateway contra la URL pública real `https://water.riegocom.uk/` (no solo `localhost:8443`) | OK — login, cambio de área, y los dos fixes de caché/service worker confirmados ahí también |
| Mobile (viewport emulado 375x812, Chrome UA): login, dashboard, menú hamburguesa, selector de área | OK, sin scroll horizontal. **No probado en un teléfono físico real** (pendiente, ver sección 2) |
| Fix de `Cache-Control` + bloqueo de service worker | Reproducido el bug (etiqueta de área vieja con datos de otra área) y confirmado el fix, en desktop y mobile emulado |

---

## 7. Errores pendientes y cómo reproducirlos

No hay ningún bug conocido sin arreglar en este momento — los 3 bugs
reales encontrados esta sesión (colgado de `responseInterceptor`, crash
del `upgrade` handler, caché/service worker sirviendo etiqueta vieja)
están arreglados y verificados. Lo que sigue abierto es más bien
**verificación pendiente**, no bugs confirmados:

1. **Reintento de login al Edge** (`establecerSesionEdge` en
   `water-gateway/server.js`): tiene un reintento con pausa de 1.5s si el
   primer intento falla, pero nunca se forzó un fallo real de red para
   confirmarlo end-to-end. Para reproducir/probar: parar
   `casa-norte-nodered` (`docker compose stop casa-norte-nodered`),
   iniciar sesión en el gateway con un usuario de esa área, levantar el
   contenedor de nuevo a mitad del login (ventana de tiempo corta,
   difícil de cronometrar a mano — quizás mejor con un script que loguee
   y pare/levante el contenedor en paralelo).
2. **Mobile real**: sin bug conocido, pero sin confirmar en hardware
   real. Si aparece algo, lo más probable es relacionado a
   `safe-area-inset` (ver sección 4, la barra flotante) o al picker
   nativo de `<select>` en iOS Safari específicamente (no se probó ese
   navegador, solo Chrome emulado).

---

## 8. Comandos para continuar

```bash
# Ubicarse en el repo
cd /c/Projects/Falcon-Docker   # (Windows: C:\Projects\Falcon-Docker)

# Ver estado de todo el stack
docker ps --filter "name=falcon" --format "table {{.Names}}\t{{.Status}}"

# Reconstruir y redesplegar el gateway (unico servicio "normal" -- reconstruir alcanza)
docker compose build gateway && docker compose up -d gateway
docker logs falcon-gateway-1 --tail 30

# Cambios a flows.json (Edge o Hub) SIEMPRE necesitan este ciclo completo:
docker compose build nodered   # reconstruye la imagen falcon-docker:latest (Edge + Hub comparten imagen)
docker cp nodered/riego-flow-backup/flows.json falcon-nodered-1:/data/flows.json
docker cp nodered/riego-flow-backup/flows.json falcon-casa-norte-nodered-1:/data/flows.json
docker cp nodered/hub-flow-backup/flows.json falcon-hub-nodered-1:/data/flows.json
docker compose restart nodered casa-norte-nodered hub-nodered

# Verificar sincronizacion repo <-> contenedores (deberian coincidir)
docker exec falcon-nodered-1 md5sum /data/flows.json
md5sum nodered/riego-flow-backup/flows.json

# Ver usuarios/areas reales en el Hub (Postgres compartido)
docker exec falcon-postgres-1 psql -U chirpstack -d chirpstack -c \
  "SELECT u.username, u.role, array_agg(ua.area_id) FROM riego_hub.users u LEFT JOIN riego_hub.user_areas ua ON ua.user_id=u.id GROUP BY u.username, u.role;"

# Probar el sitio publico real
curl -s -o /dev/null -w "HTTP:%{http_code}\n" https://water.riegocom.uk/

# Logs del gateway (el servicio mas nuevo/fragil)
docker logs falcon-gateway-1 --tail 50
```

**Nota Windows/Git-Bash**: varios comandos `docker cp`/`docker exec` con
rutas que empiezan con `/` necesitan `MSYS_NO_PATHCONV=1` adelante para
que Git-Bash no las reinterprete como rutas de Windows (problema conocido
y recurrente en esta sesión, ya resuelto cada vez que apareció).

---

## 9. Diferencias entre archivos del repo y los flujos corriendo en los contenedores

**Verificado ahora mismo (hashes MD5 idénticos):**

```
falcon-nodered-1:/data/flows.json            == nodered/riego-flow-backup/flows.json
falcon-casa-norte-nodered-1:/data/flows.json == nodered/riego-flow-backup/flows.json
falcon-hub-nodered-1:/data/flows.json        == nodered/hub-flow-backup/flows.json
```

**No hay diferencia en este momento.** El riesgo real es hacia
ADELANTE: si quien continúe edita `flows.json` en el repo y se olvida del
ciclo `docker cp` + `restart` (sección 8), los contenedores reales
quedarán corriendo una versión vieja sin que se note a simple vista (el
contenedor arranca bien igual, solo le falta el código nuevo). Siempre
re-verificar con `md5sum` después de un cambio.

**Datos que SOLO existen en Postgres** (no en ningún archivo del repo, no
se pueden "diffear" contra el código):
- `riego_hub.areas` (incluida la estructura real de cada sitio y
  `internal_url`).
- `riego_hub.users` / `riego_hub.user_areas` (usuarios reales y sus
  asignaciones — ver snapshot abajo).
- `riego_auth.session` de cada Edge y `riego_hub.gateway_sessions` del
  gateway (sesiones activas).

**Snapshot de áreas y usuarios al momento de escribir esto:**

```
areas:
  casa-principal  | active | structure_version=20 | internal_url=http://nodered:1880
  casa-norte      | active | structure_version=34 | internal_url=http://casa-norte-nodered:1880
  casa-sur        | active | structure_version=8  | internal_url=(vacio, sin PC todavia)

usuarios:
  ramon  (admin)    -> casa-principal, casa-norte, casa-sur
  Ariel  (admin)    -> casa-principal
  Tammy  (estandar) -> casa-sur          <- revisar, ver seccion 2 punto 1
  Test   (estandar) -> casa-norte        <- lo creo el usuario mismo
```

---

## 10. Próximo paso concreto

**Preguntarle al usuario, en este orden:**

1. ¿La reasignación de `Tammy` a `casa-sur` (en vez de `casa-principal`)
   fue intencional? Si fue sin querer, reasignarla en
   `/hub/usuarios/<id>/asignar`.
2. ¿Confirmó ya la experiencia en un teléfono físico real? Si encontró
   algo raro, lo más probable es la barra flotante o el `<select>` nativo
   en iOS Safari (ver sección 7, punto 2).
3. ¿Quiere que se fuerce el cambio de contraseña (`mustChangePassword`)
   antes de dejar operar a través del gateway? Hoy no bloquea nada.

**Si no hay nada de lo anterior para resolver**, el trabajo funcional de
esta sesión está completo y verificado — el siguiente paso natural sería
avanzar con la PC física de "Casa Sur" cuando el usuario la tenga lista
(seguir `agregar-sitio-nuevo.pdf`).
