// Genera una página autocontenida con los dictámenes reales del motor.
// No es la app de Next.js: es la misma pantalla, los mismos datos y las mismas
// salidas del motor, servidas como un solo archivo para poder enlazarla.
//
//   node --experimental-strip-types scripts/exportar-estatico.ts <destino.html>

import { readFileSync, writeFileSync } from 'node:fs';
import { auditar } from '../src/dominio/motor.ts';
import { entornoPorDefecto } from '../src/dominio/entorno.ts';
import { construirFactura } from '../src/datos/constructor.ts';
import { TRAMPAS } from '../src/datos/trampas.ts';
import { formato } from '../src/dominio/dinero.ts';

const destino = process.argv[2] ?? 'perito-ai.html';
const env = entornoPorDefecto();

const casos = TRAMPAS.map((t) => {
  const factura = t.crudo
    ? (t.factura as unknown as import('../src/dominio/tipos.ts').FacturaCruda)
    : construirFactura(t.factura);
  const dictamen = auditar(factura, env);
  return { id: t.id, nota: t.nota, factura, dictamen };
});

const totalFacturado = casos.reduce((a, c) => a + c.dictamen.totalFacturado, 0);
const totalObjetado = casos.reduce((a, c) => a + c.dictamen.totalObjetado, 0);
const conHallazgos = casos.filter((c) => c.dictamen.estado !== 'CONFORME').length;
const msMax = Math.max(...casos.map((c) => c.dictamen.ms));

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const datos = JSON.stringify({ casos, formatoCache: null }).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>PERITO AI · Auditoría de facturación de siniestros</title>
<meta name="description" content="Audita las facturas del taller contra el tarifario acordado y objeta con la cláusula en la mano.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${css}

/* La página se sirve dentro de un visor con su propio tema; el diseño es
   oscuro por intención, así que el fondo se declara y no se hereda. */
:root {
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
html { scroll-padding-top: env(safe-area-inset-top, 0px); }
body { background-color: var(--tinta); color: var(--texto); }
.bandeja { max-height: min(60vh, 560px); }
@media (max-width: 900px) { .bandeja { max-height: 320px; } }
img, svg { max-width: 100%; }
</style>
</head>
<body>
<div class="envoltura">
  <header class="cabecera">
    <div class="marca">
      <div class="marca__glifo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#061d30" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/><path d="M7.8 10.6l2 2 3.6-4"/>
        </svg>
      </div>
      <div class="marca__texto">
        <h1>PERITO AI</h1>
        <p>Auditoría de facturación de siniestros</p>
      </div>
    </div>
    <div class="sello">Prototipo · datos sintéticos</div>
  </header>

  <section class="titular">
    <h2>Ninguna objeción sin <em>la cláusula que la sostiene.</em></h2>
    <p>Cada factura del taller se compara línea por línea contra el tarifario acordado, el daño reportado y lo ya pagado en el mismo siniestro. Toda objeción sale con su cláusula y con el fragmento del documento del que salió. Si el criterio es de un perito, el agente no decide: deriva.</p>
    <p class="titular__nota"><strong>Estado del prototipo:</strong> esta versión audita un corpus precargado. Todavía no hay entrada de facturas nuevas ni lectura con un modelo de lenguaje, y ninguna parte de la aplicación llama a un modelo. Es el siguiente trabajo, no algo que ya esté hecho.</p>
  </section>

  <section class="cifras">
    <div class="cifra"><div class="cifra__valor mono">${formato(totalFacturado)}</div><div class="cifra__etq">Facturado por los talleres</div></div>
    <div class="cifra cifra--acento"><div class="cifra__valor mono">${formato(totalObjetado)}</div><div class="cifra__etq">Objetado o retenido</div></div>
    <div class="cifra"><div class="cifra__valor mono">${conHallazgos}/${casos.length}</div><div class="cifra__etq">Facturas con hallazgos</div></div>
    <div class="cifra"><div class="cifra__valor mono">${msMax.toFixed(2)} ms</div><div class="cifra__etq">Peor caso del motor determinista</div></div>
  </section>

  <div class="tablero">
    <div class="panel">
      <div class="panel__cab"><h3>Bandeja de facturas</h3><span class="mono" style="font-size:12px;color:var(--texto-3)">${casos.length}</span></div>
      <div class="bandeja" id="bandeja" role="listbox" aria-label="Facturas"></div>
    </div>
    <div class="panel" id="dictamen"></div>
  </div>

  <footer class="pie">
    Pólizas, talleres, placas, siniestros y facturas son sintéticos, creados para el hackIAthon Panamá 2026. No corresponden a ninguna aseguradora ni taller real. El motor de decisión corre sin red y sin llamar a ningún modelo. Esta vista muestra el corpus de referencia precargado, que se audita solo con reglas; la aplicación completa añade la lectura de facturas nuevas con un modelo de lenguaje, que lee y cita pero nunca decide.
  </footer>
</div>

<script id="datos" type="application/json">${datos}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('datos').textContent);
  var casos = D.casos;
  var ETIQUETA = {
    CONFORME: 'Conforme', OBJETADA_PARCIAL: 'Objetada', OBJETADA: 'Objetada',
    RECHAZADA: 'Rechazada', DERIVADA: 'A perito', PENDIENTE: 'Pendiente',
    INVALIDA: 'No procesable'
  };

  function fmt(c) {
    var s = c < 0 ? '-' : '', a = Math.abs(c);
    return s + 'B/. ' + Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
  }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  function motivoHTML(m) {
    return '<div class="motivo' + (m.monto === 0 ? ' motivo--informativo' : '') + '">' +
      '<div class="motivo__cab"><span class="motivo__cod mono">' + esc(m.codigo) +
      (m.monto > 0 ? ' · ' + fmt(m.monto) : '') + '</span>' +
      '<span class="motivo__clausula mono">Cláusula ' + esc(m.clausula) + '</span></div>' +
      '<p class="motivo__detalle">' + esc(m.detalle) + '</p>' +
      '<p class="motivo__cita mono"><span class="procedencia procedencia--' + m.origenCita + '">' +
      (m.origenCita === 'documento' ? 'del documento' : 'reconstruida') + '</span>' + esc(m.cita) + '</p></div>';
  }

  function pintarDictamen(i) {
    var c = casos[i], d = c.dictamen, h = '';
    h += '<div class="panel__cab"><h3>Dictamen · ' + esc(d.factura) + ' · ' + esc(d.siniestro) + '</h3>' +
      '<span class="insignia insignia--' + d.estado + '">' + ETIQUETA[d.estado] + '</span></div>';
    h += '<div class="dictamen__resumen">' +
      '<div class="dictamen__celda"><span>Cobrado</span><strong class="mono">' + fmt(d.totalFacturado) + '</strong></div>' +
      '<div class="dictamen__celda dictamen__celda--objetado"><span>Objetado o retenido</span><strong class="mono">' + fmt(d.totalObjetado) +
      (d.totalObjetado > 0 ? ' <em style="font-style:normal;font-size:13px;opacity:.7">· ' + d.porcentajeObjetado + '%</em>' : '') + '</strong></div>' +
      '<div class="dictamen__celda dictamen__celda--pagar"><span>Importe reconocido preliminar</span><strong class="mono">' + fmt(d.totalAPagar) + '</strong></div>' +
      '<div class="dictamen__celda"><span>Motor determinista</span><strong class="mono">' + d.ms.toFixed(2) + ' ms</strong></div></div>';

    if (d.requiereRevision) {
      h += '<div class="aviso"><strong>No procede pagar todavía. Decide una persona.</strong><ul>' +
        d.razonesRevision.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    }
    if (!d.documentoConcilia && d.estado !== 'INVALIDA') {
      h += '<p class="aviso aviso--dato mono">Declarado ' + fmt(d.totalFacturado) +
        ' · las líneas más ITBMS dan ' + fmt(d.totalCalculado) + '</p>';
    }
    h += '<p style="margin:0;padding:13px 22px;font-size:12.5px;color:var(--texto-3);border-bottom:1px solid var(--borde-suave);line-height:1.55">' + esc(c.nota) + '</p>';
    if (d.motivosFactura.length) {
      h += '<div style="padding:14px 22px 4px">' + d.motivosFactura.map(motivoHTML).join('') + '</div>';
    }
    if (!d.lineas.length) {
      h += '<div class="vacio">La factura no pasó las puertas de admisión, así que sus líneas no se auditaron.</div>';
    } else {
      h += '<div class="lineas">' + d.lineas.map(function (l) {
        return '<div class="linea"><div class="linea__cab"><div>' +
          '<div class="linea__desc">' + esc(l.cruda.descripcion) + '</div>' +
          '<div class="linea__cod mono">' + esc(l.cruda.codigo || '(sin código)') + ' · ' + l.cruda.cantidad + ' × ' + fmt(l.cruda.precioUnitario) + '</div></div>' +
          '<div class="linea__montos mono">' + fmt(l.cruda.importe) +
          (l.montoObjetado > 0 ? '<br><b>−' + fmt(l.montoObjetado) + '</b>' : '') + '</div></div>' +
          l.motivos.map(motivoHTML).join('') + '</div>';
      }).join('') + '</div>';
    }
    document.getElementById('dictamen').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#bandeja .item'), function (b, j) {
      b.setAttribute('aria-current', j === i ? 'true' : 'false');
    });
  }

  document.getElementById('bandeja').innerHTML = casos.map(function (c) {
    var d = c.dictamen;
    return '<button class="item" aria-current="false">' +
      '<div class="item__fila"><span class="item__num mono">' + esc(c.dictamen.factura) + '</span>' +
      '<span class="insignia insignia--' + d.estado + '">' + ETIQUETA[d.estado] + '</span></div>' +
      '<div class="item__fila"><span class="item__nota mono" style="color:var(--texto-2)">' + esc(c.dictamen.siniestro) + '</span>' +
      '<span class="item__nota mono">' + (d.totalObjetado > 0 ? fmt(d.totalObjetado) : '—') + '</span></div></button>';
  }).join('');

  Array.prototype.forEach.call(document.querySelectorAll('#bandeja .item'), function (b, i) {
    b.addEventListener('click', function () { pintarDictamen(i); });
  });
  pintarDictamen(0);
})();
</script>
</body>
</html>`;

writeFileSync(destino, html);
console.log(`${destino} · ${(html.length / 1024).toFixed(0)} kB · ${casos.length} dictámenes`);
