
Necesito realizar la implementación de un sistema de backup de las bases de datos de turso en los entornos de pre (staging) y producción (no en local).
Como sabes, la base de datos de la api actualmente reside en turso cloud (parámetros TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en el fichero env de api).

El sistema o proceso para realizar y guardar los backups o dumps de la base de datos será crear dos buckets S3 de AWS (para staging y prod), la creación del dump de la base de datos de forma programática (utilizando la funcionalidad ya implementada de tareas programadas en el contenedor docker de la api) para generar un dump de la base de datos todos los días a las 04:00 de la madrugada y subirlo al bucket S3 correspondiente.

Hay que tener en cuenta que la base de datos, tanto en staging como en prod, está en "turso cloud", así que hasta donde yo se para hacer el dump o backup de la base de datos habría que usar la herramienta turso cli. O por lo menos es como lo he venido haciendo yo manualmente.
Puedes consultar el proceso manual que he seguido hasta ahora en la nota @docs/turso-doc.md

Si no se puede instalar turso cli dentro del contenedor docker, debes encontrar una forma de realizar este proceso dentro de las tareas programadas. Si no se puede de ninguna forma, avísame y dame el feedback necesario, y te informaré de los siguientes pasos para intentar realizarlo de otra forma.

Como parte de la documentación del cambio debes ofrecer una guía completa para la creación de los buckets S3 en AWS y la configuración de los mismos y en el repo para poder hacer referencia a ellos para guardar los dumps o backups de la base de datos.

Como he dicho, los procesos de dump o backup se ejecutarán todos los días a las 04:00 de la madrugada. La retención de los dumps en el bucket S3 funcionará de la siguiente manera:

Se deberán guardar los dumps últimos 15 días (eliminando progresivamente los anteriores a 15 días), y una cada mes (día 4) por si necesitamos de más tiempo atrás (pero sin sobrecargar). Sobre la copia de cada mes: se guardará el dump o backup del día 4 de cada mes. El proceso que borre los dumps más antiguos de 15 días debe tener en cuenta no eliminar los dumps del día 4 de cada mes.

Analiza bien toda la información, pregúntame si hay algo que no te cuadre, si tienes alguna duda, o si necesitas más información de cualquier tipo, y procede con la propuesta del cambio openspec.