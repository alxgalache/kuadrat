#!/usr/bin/env python3
"""
Comprobación rápida de SEO / datos estructurados sobre URLs ya publicadas.

Uso:
    python3 scripts/check-seo.py https://140d.art
    python3 scripts/check-seo.py https://140d.art/galeria/p/mi-obra
    python3 scripts/check-seo.py http://localhost:3000            # local

Sin segunda URL recorre el conjunto de rutas públicas de referencia. Con una
ruta concreta, comprueba sólo esa.

Qué mira, y por qué cada cosa:

  · <title>, <meta description> y <link rel=canonical>  — que existan y no
    estén vacíos. Una canónica ausente hace que cada variante con parámetros de
    campaña (?utm_source=…) sea una URL distinta para el buscador.
  · Que dos rutas no declaren la misma canónica. Cuando pasa, le estás diciendo
    al buscador que una de las dos no merece indexarse (le ocurría a las cinco
    páginas legales, que apuntaban todas a la portada).
  · Exactamente un <h1>, contado FUERA de los <script>: dentro del payload de
    React aparecen etiquetas que no son marcado real de la página.
  · Que cada bloque JSON-LD parsee. Un JSON roto no es "un poco peor": el
    buscador descarta el bloque entero sin avisar.
  · noindex, para detectar una página que se publica sin querer o al revés.

NO sustituye al validador de resultados enriquecidos de Google: eso comprueba
que el schema cumpla los requisitos de cada tipo de resultado. Esto comprueba
que lo que sale por el cable es lo que crees que sale.

AVISO, y está aquí porque ya costó un despliegue: pasarlo contra `next dev` NO
equivale a pasarlo contra producción. El servidor de desarrollo renderiza de
otra forma que el prerenderizado estático. En las páginas con `useSearchParams()`
—/galeria y /tienda— Next se sale a cliente al prerenderizar y hornea en el HTML
el FALLBACK del Suspense, no el contenido: en desarrollo salía un <h1> que en el
HTML estático no existía. Para comprobar de verdad lo que se va a publicar:

    docker compose exec -e NODE_ENV=production client npm run build
    docker compose exec client grep -c "<h1" .next/server/app/galeria.html

o simplemente pasar este script contra el dominio ya desplegado.
"""

import json
import re
import sys
import urllib.error
import urllib.request

RUTAS = [
    "/",
    "/galeria",
    "/galeria/artistas",
    "/tienda",
    "/eventos",
    "/live",
    "/sobre-140d",
    "/guias",
    "/preguntas-frecuentes",
    "/contacto",
    "/legal/aviso-legal",
    "/legal/terminos-y-condiciones",
    "/legal/politica-de-privacidad",
    "/legal/politica-de-cookies",
    "/legal/normas-eventos",
]

TIPOS_RUIDO = {
    "ListItem", "Question", "Answer", "Offer", "QuantitativeValue",
    "ContactPoint", "PostalAddress", "Place", "Country",
}


def descargar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "check-seo/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def bloques_jsonld(html):
    """Devuelve (objetos_ok, errores). El JSON-LD se emite con < > & escapados
    como \\u003c etc. para que el texto del vendedor no pueda cerrar el
    <script>; hay que deshacerlo antes de parsear."""
    ok, malos = [], []
    for crudo in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        limpio = crudo.replace("\\u003c", "<").replace("\\u003e", ">").replace("\\u0026", "&")
        try:
            ok.append(json.loads(limpio))
        except Exception as e:
            malos.append(str(e))
    return ok, malos


def etiqueta(dato):
    t = dato.get("@type")
    t = "+".join(t) if isinstance(t, list) else (t or "?")
    if t == "ItemList":
        return f"{t} ({dato.get('numberOfItems')} elementos)"
    if t == "FAQPage":
        return f"{t} ({len(dato.get('mainEntity', []))} preguntas)"
    if t == "BreadcrumbList":
        nombres = [i.get("name") for i in dato.get("itemListElement", [])]
        return f"{t} ({' › '.join(n for n in nombres if n)})"
    disp = json.dumps(dato, ensure_ascii=False)
    m = re.search(r"schema\.org/(InStock|SoldOut|PreOrder)", disp)
    return f"{t} ({m.group(1)})" if m else t


def revisar(base, ruta):
    url = base.rstrip("/") + ruta
    try:
        html = descargar(url)
    except urllib.error.HTTPError as e:
        return ruta, None, [f"HTTP {e.code}"]
    except Exception as e:
        return ruta, None, [f"inalcanzable: {e}"]

    problemas = []
    titulo = (re.search(r"<title>(.*?)</title>", html, re.S) or ["", ""])[1].strip()
    desc = (re.search(r'<meta name="description" content="(.*?)"', html, re.S) or ["", ""])[1].strip()
    canon = (re.search(r'<link rel="canonical" href="(.*?)"', html, re.S) or ["", ""])[1].strip()
    noindex = "noindex" in html.lower()

    cuerpo = re.sub(r"<script.*?</script>", "", html, flags=re.S)
    h1 = len(re.findall(r"<h1[\s>]", cuerpo))

    if not titulo:
        problemas.append("sin <title>")
    if not desc:
        problemas.append("sin meta description")
    if not canon and not noindex:
        problemas.append("sin canonical")
    if h1 != 1:
        problemas.append(f"{h1} etiquetas <h1> (debe haber 1)")

    datos, malos = bloques_jsonld(html)
    for m in malos:
        problemas.append(f"JSON-LD que no parsea: {m}")

    tipos = []
    for d in datos:
        t = d.get("@type")
        t = t if isinstance(t, list) else [t]
        if not set(t) & TIPOS_RUIDO:
            tipos.append(etiqueta(d))

    print(f"\n{ruta}")
    print(f"  title      {len(titulo):>3} car.  {titulo[:70]}")
    print(f"  desc       {len(desc):>3} car.")
    print(f"  canonical  {canon or '(ninguna)'}")
    print(f"  h1         {h1}{'   [noindex]' if noindex else ''}")
    for t in tipos:
        print(f"  JSON-LD    {t}")
    for p in problemas:
        print(f"  ⚠  {p}")

    return ruta, canon, problemas


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    base = sys.argv[1].rstrip("/")
    if len(sys.argv) > 2:
        rutas = sys.argv[2:]
    elif re.match(r"^https?://[^/]+/?$", sys.argv[1]):
        rutas = RUTAS
    else:
        m = re.match(r"^(https?://[^/]+)(/.*)$", sys.argv[1])
        base, rutas = m.group(1), [m.group(2)]

    canonicas, fallos = {}, 0
    for ruta in rutas:
        _, canon, problemas = revisar(base, ruta)
        fallos += len(problemas)
        if canon:
            canonicas.setdefault(canon, []).append(ruta)

    duplicadas = {c: r for c, r in canonicas.items() if len(r) > 1}
    print("\n" + "=" * 60)
    if duplicadas:
        print("CANÓNICAS DUPLICADAS (dos rutas dicen ser la misma página):")
        for c, r in duplicadas.items():
            print(f"  {c}  <-  {', '.join(r)}")
        fallos += len(duplicadas)
    else:
        print("Canónicas duplicadas: ninguna")

    print(f"Rutas revisadas: {len(rutas)}   Problemas: {fallos}")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
