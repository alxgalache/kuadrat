
#### Proceso para restaurar la base de datos de turso desde un momento concreto

1. Autenticamos en turso
`turso auth login`
2. Creamos una base de datos auxiliar para almacenar el estado de la bd en el timestamp
`turso db create backup1 --from-db 140d-pre --timestamp 2025-12-08T11:00:00Z`
3. Sacamos a un fichero un dump de la base de datos en el momento de ese timestamp
`turso db shell backup1 .dump > utils/140d-pre_2025-12-08.sql`
4. Borramos la BD auxiliar despues de obtener el fichero del dump
`turso db destroy backup1`
5. Borramos la BD en cuestión
`turso db destroy 140d-pre`
6. Restauramos la BD original con dump que obtuvimos de la BD auxiliar
`turso db create 140d-pre`
`turso db shell 140d-pre < utils/140d-pre_2025-12-08.sql`
7. Creamos nuevos token para el acceso a la BD y modificamos los datos en el fichero .env correspondiente
`turso db tokens create 140d-pre`

#### Realizar un dump de la BD (general)

`turso db shell 140d-pre .dump > utils/140d-pre.sql`

Tambien es posible realizar una exportación de una base de datos, en ese momento o con un timestamp determinado, desde la interfaz web, creando una branch distinta para esa BD



