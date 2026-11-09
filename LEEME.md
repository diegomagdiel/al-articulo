# Al Artículo — prototipo de la idea #9 (código anotado digital)

Experimento del laboratorio (veredicto **Incubar**, 2026-11-03). Ver [la evaluación](../../evaluaciones/codigo-anotado.md).

**Qué prueba**: si escribir "182 cpc" y llegar directo al artículo (como el buscador del DLE de la RAE) ahorra tiempo frente
a Google, LeyChile o IURA, y si las notas tipo post-it en el teléfono sirven.

## Qué tiene

- Buscador con sugerencias mientras se escribe: `182 cpc`, `cpc 182`, `art. 1698 del código civil`, `548-1 cc`,
  `152 bis a ct`, `5 transitorio cpr`, `182cpc`, `art 3 ley 19496`, o palabras (`nulidad absoluta`, `arrendamiento`).
- 15 códigos descargados (Constitución, Civil, Procedimiento Civil, Penal, Procesal Penal, Trabajo, Comercio, Orgánico de
  Tribunales, Tributario, Aguas, Minería, Sanitario, Aeronáutico, Justicia Militar y Procedimiento Penal antiguo).
- **Cualquier ley de la BCN a pedido** con `servidor.py` (intermediario: la BCN no acepta consultas directas desde el
  navegador). Si la ley tiene texto refundido, se abre el refundido vigente. Las búsquedas por tema muestran también
  normas de la BCN.
- Estado de cada artículo: "Texto original" o "Modificado (N cambios) · último: Ley X, D.O. fecha", con su historial.
- Artículo a pantalla completa, anterior/siguiente con transición, índice por norma, copiar cita, enlace a la BCN.
- Subrayado y **varios post-it por artículo en 5 colores**; cada color puede tener un significado ("Plazos"…).
  **Guardados solo en el dispositivo** (sin cuentas). Respaldo con exportar/importar.
- Aviso si un artículo anotado cambió (compara el texto anotado con el actual).
- **Prueba de tiempo**: cronómetro automático para 3 artículos (182 CPC, 1698 CC, 160 CT) y cronómetro manual para
  medir otras herramientas. Es el instrumento del experimento.

## Dónde está publicado

- **App**: https://diegomagdiel.github.io/al-articulo/ (GitHub Pages, gratis). Es un sitio estático: funciona aunque el
  computador esté apagado, con los 15 códigos y las 35 leyes precargadas en `datos/`.
- **Actualización automática**: `.github/workflows/actualizar-leyes.yml` corre cada noche, vuelve a descargar todo desde
  la BCN y hace commit **solo si algún texto cambió**. Se puede lanzar a mano desde la pestaña *Actions*.
- Agregar una ley precargada: sumarla a la lista `LEYES` de `herramientas/descargar_bcn.py`.
- Las notas de cada persona viven en su propio navegador; cambiar de dirección (de la red local a la pública) obliga a
  pasarlas con "Exportar / Importar respaldo" en *Mis notas*.

## Cómo actualizar los textos

```bash
python -I herramientas/descargar_bcn.py
```

Descarga desde el servicio público que usa el visor de LeyChile y regenera `datos/`. Los códigos y sus abreviaturas
se configuran en la lista `CODIGOS` del script.

## Cómo probarlo (computador y teléfonos de la misma red Wi-Fi)

```bash
python -I servidor.py 8766
```

(desde esta carpeta) y abrir `http://<IP del computador>:8766` en el teléfono. Sin `servidor.py` (por ejemplo, en un
hosting estático) funciona igual con los 15 códigos, pero no puede traer otras leyes.

## Límites conocidos

- Las notas viven en un solo navegador: si se borran los datos del navegador, se pierden (usar "Exportar respaldo").
- Los textos son una foto del día de descarga; cada artículo enlaza a su versión oficial.
- El Libro IV del Código de Comercio (antigua ley de quiebras, derogado) tiene numeración propia: sus artículos
  aparecen como `1 (Libro IV)`.
