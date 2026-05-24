
3.2 Endpoints admin (tarea 8.10)

Necesitas un JWT de admin. Si ya tienes uno guardado, sáltate este paso. Si no, obtenlo:

curl -s -X POST http://localhost:3001/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"<TU_EMAIL_ADMIN>","password":"<TU_PASSWORD>"}' | head

Copia el token de la respuesta. Exporta a variable para comodidad:
export ADMIN_TOKEN='<el-token>'

Test 1 — listado paginado:
curl -s "http://localhost:3001/api/admin/coa/tags?page=1&limit=10" \
-H "Authorization: Bearer $ADMIN_TOKEN" | head -c 1000
Esperado: {"success":true,"tags":[{...}],"pagination":{"page":1,"pages":1,"total":1,"limit":10}} con la pegatina 04A1B2C3D4E5F6 incluida.

Test 2 — filtro por status:
curl -s "http://localhost:3001/api/admin/coa/tags?status=active" \
-H "Authorization: Bearer $ADMIN_TOKEN" | head -c 500
Esperado: aparece la pegatina (está en active).

curl -s "http://localhost:3001/api/admin/coa/tags?status=revoked" \
-H "Authorization: Bearer $ADMIN_TOKEN" | head -c 200
Esperado: tags: [] (no hay nada en revoked aún).

Test 3 — detalle con historial:
curl -s "http://localhost:3001/api/admin/coa/tags/04A1B2C3D4E5F6?events_limit=10" \
-H "Authorization: Bearer $ADMIN_TOKEN" | head -c 2000
Esperado: la fila completa del tag + array events con los intentos de verificación que hiciste en el paso 2 (ok / replay / ok / invalid_cmac, ordenados por occurred_at DESC).

Test 4 — cambio de status (revocar con motivo):
curl -s -X PATCH "http://localhost:3001/api/admin/coa/tags/04A1B2C3D4E5F6/status" \
-H "Authorization: Bearer $ADMIN_TOKEN" \
-H "Content-Type: application/json" \
-d '{"status":"revoked","notes":"Test de revocación E2E"}' | head -c 500
Esperado: HTTP 200 con el tag actualizado, status="revoked", notes con un timestamp + tu motivo.

Test 5 — verificar que la revocación se propaga al endpoint público:
node src/test-build-url.js 04A1B2C3D4E5F6 3
curl -s "http://localhost:3001/api/coa/verify?picc=<NUEVO_PICC>&cmac=<NUEVO_CMAC>"
Esperado: {"success":true,"status":"revoked"}. Cierra el bucle: el cambio admin afecta a la verificación pública.

Test 6 — idempotencia (segundo PATCH con mismo status):
curl -s -X PATCH "http://localhost:3001/api/admin/coa/tags/04A1B2C3D4E5F6/status" \
-H "Authorization: Bearer $ADMIN_TOKEN" \
-H "Content-Type: application/json" \
-d '{"status":"revoked"}' | head -c 200
Esperado: HTTP 200. Si miras la fila en BD, las notes no deben tener una entrada nueva timestamped (no se llama UPDATE si nada cambia).

Test 7 — rechazo sin auth:
curl -s -i "http://localhost:3001/api/admin/coa/tags" | head -5
Esperado: HTTP 401.

Test 8 — restaurar la pegatina para no dejar BD sucia:
curl -s -X PATCH "http://localhost:3001/api/admin/coa/tags/04A1B2C3D4E5F6/status" \
-H "Authorization: Bearer $ADMIN_TOKEN" \
-H "Content-Type: application/json" \
-d '{"status":"active","notes":"Restaurada tras test E2E"}'