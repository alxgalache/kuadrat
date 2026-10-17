# Inicio automático de los eventos

Guía operativa del inicio automático de los eventos de `/live`. Decisiones y motivos: `openspec/changes/event-auto-start` (archivado al terminar). Requisitos: `openspec/specs/event-auto-start`.

---

## 1. Activarlo

Solo funciona donde la variable está activada, en el `api/.env` del servidor:

```
EVENT_AUTO_START_ENABLED=true
```

- **Producción y staging:** activada. Tras cambiarla, reinicia el contenedor de la API.
- **Local:** **no la actives.** La API local apunta a la base de datos de preproducción: iniciaría sus eventos desde tu máquina.
- **Tests:** siempre apagada.

Al arrancar, el log dice `[eventStartScheduler] Event auto-start scheduled every 30 s` o `… EVENT_AUTO_START_ENABLED not set — scheduler not started`.

**Para dejar de iniciar eventos solos sin desplegar:** quita la variable y reinicia la API. «Iniciar» sigue funcionando como siempre.

**Antes de desplegar por primera vez:** revisa el listado de `/admin/espacios`. Todo evento «Programado» que esté dentro de su horario en ese momento se iniciará en la primera pasada.

---

## 2. Qué se inicia y cuándo

- **Todos los eventos «Programado»:** LiveKit y Agora, directos y pases de vídeo, también los de prueba.
- **Cuándo:** como mucho 30 segundos después de su fecha y hora (hora peninsular española). Cuando se aplique el cambio de portadas (`agora-stage-covers`), en un stream de Agora el público verá «Empezamos en breve» desde ese momento.
- **Solo dentro del horario del propio evento**, entre su hora de inicio y su hora de inicio más la duración. Un evento cuya hora ya pasó del todo no se inicia nunca: queda «Programado» hasta que lo inicies o lo canceles.
- **Nunca:** borradores, cancelados ni finalizados.

Se hace **exactamente lo mismo que al pulsar «Iniciar»**:

- se crea la sala de LiveKit o se fija el canal de Agora;
- en un pase de vídeo, empieza el vídeo;
- se avisa a quien tiene la ficha abierta;
- arranca la grabación, si el evento la tiene.

## 3. Adelantar, retrasar o impedir

| Quiero… | Haz esto |
|---|---|
| Empezar antes de la hora | Pulsa «Iniciar» en el listado. A la hora no pasa nada más |
| Empezar más tarde | Cambia la fecha y la hora del evento |
| Que no empiece | Cancélalo o pásalo a borrador |

Si pulsas «Iniciar» justo cuando se inicia solo, el evento se inicia una sola vez.

## 4. El email de alerta

Si a los **2 minutos** de su hora un evento todavía no ha podido iniciarse, llega a `BUSINESS_EMAIL` un email «Un evento no ha podido iniciarse automáticamente», con el evento, la hora y el error. Llega una vez por evento.

Hoy solo puede pasar en eventos LiveKit (fallo al crear la sala) o por un error de la base de datos. Se sigue reintentando cada 30 segundos mientras dure el evento, pero el público ya está esperando:

1. Pulsa «Iniciar» en `/admin/espacios`.
2. Si también falla, revisa los logs de la API (`[eventAutoStart]`) y Sentry.

## 5. Cosas que conviene saber

- **La grabación empieza con el evento, no con el host.** Si el host llega más de 30 minutos tarde, Agora corta la grabación por inactividad: llega la alerta de grabación «interrumpida» y se reanuda sola al entrar el host.
- **Un evento que nadie finaliza sigue «En directo»**, igual que al iniciarlo a mano. El inicio automático no finaliza nada.
- **En los logs**, cada inicio automático deja `[eventAutoStart] Event started at its scheduled time` con la hora programada y el retraso.
