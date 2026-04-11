---
name: Sequential change implementation — wait for OK between changes
description: When user asks for multi-change implementation (#1→#2→#3...), stop after each one and wait for explicit approval before starting the next
type: feedback
---

Cuando el usuario pide implementar varios changes de OpenSpec en secuencia ("implementa #1 → #2 → #3 → #4"), **parar al terminar cada change y esperar aprobación explícita** antes de comenzar el siguiente. No encadenar automáticamente.

**Why:** El usuario quiere revisar/validar cada change antes de avanzar. En la sesión del 2026-04-09 para Stripe Connect, al acabar Change #1 empecé a leer contexto de Change #2 por iniciativa propia y el usuario me interrumpió explícitamente: *"al finalizar cada uno de los 4 debes parar, hasta que te de la orden de continuar con el siguiente"*.

**How to apply:** Al completar la última tarea de un change en una secuencia multi-change:
1. Reportar el estado final del change terminado (tareas code completas, tareas manuales pendientes si las hay)
2. NO leer contexto del siguiente change
3. NO ejecutar `openspec status/instructions` para el siguiente change
4. Esperar a que el usuario diga explícitamente "ok", "continúa con #2", o similar
5. Si hay dudas sobre si seguir, preguntar antes de avanzar
