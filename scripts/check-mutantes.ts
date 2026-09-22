// Las puertas se prueban a sí mismas.
//
// Rompe el motor regla por regla y exige que el guantelete se dé cuenta. Un
// mutante que sobrevive es una regla que nadie está probando: el guantelete
// diría 34 de 34 aunque esa regla no existiera.
//
//   node --experimental-strip-types scripts/check-mutantes.ts

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Mutante {
  regla: string;
  archivo: string;
  de: string;
  a: string;
  /**
   * Qué puerta debe darse cuenta de esta rotura. El guantelete solo prueba
   * el motor determinista; las reglas de extracción las vigila
   * check-extraccion. Correr la puerta equivocada haría sobrevivir a un
   * mutante que en realidad sí está cubierto — y eso se leería como un
   * agujero que no existe.
   */
  puerta?: 'trampas' | 'extraccion' | 'integracion';
}

const MUTANTES: Mutante[] = [
  { regla: 'SOBREPRECIO (dinero)', archivo: 'src/dominio/motor.ts', de: 'const precioReconocible = Math.min(l.precioUnitario, partida.precioAcordado);', a: 'const precioReconocible = l.precioUnitario;' },
  { regla: 'SOBREPRECIO (motivo)', archivo: 'src/dominio/motor.ts', de: 'if (l.precioUnitario > partida.precioAcordado) {', a: 'if (false) {' },
  { regla: 'Base objetable de la línea', archivo: 'src/dominio/motor.ts', de: 'objetadoParcial = Math.max(0, facturado - importeTarifario);', a: 'objetadoParcial = 0;' },
  { regla: 'HORAS_EXCEDIDAS (dinero)', archivo: 'src/dominio/motor.ts', de: 'horasEstandar !== undefined ? Math.min(l.cantidad, horasEstandar) : l.cantidad', a: 'l.cantidad' },
  { regla: 'HORAS (borde <=)', archivo: 'src/dominio/motor.ts', de: 'if (horasEstandar !== undefined && l.cantidad > horasEstandar) {', a: 'if (horasEstandar !== undefined && l.cantidad >= horasEstandar) {' },
  { regla: 'DUPLICADO_EN_FACTURA', archivo: 'src/dominio/motor.ts', de: 'if (idéntico && puedeSerCierto) {', a: 'if (false) {' },
  { regla: 'Duplicado cierto exige identidad única', archivo: 'src/dominio/motor.ts', de: 'const puedeSerCierto = !partida || partida.identidadUnica === true;', a: 'const puedeSerCierto = true;' },
  { regla: 'Tercia cantidad/precio/importe coherente', archivo: 'src/ia/extraccion.ts', de: 'if (!tercia.ok) {', a: 'if (false) {', puerta: 'extraccion' },
  { regla: 'Intercambio detectado por etiqueta', archivo: 'src/ia/extraccion.ts', de: 'if (Math.abs(lectura.valor - valor) >= 0.005) {', a: 'if (false) {', puerta: 'extraccion' },
  { regla: 'Valor fuera de los candidatos se rechaza', archivo: 'src/ia/extraccion.ts', de: 'if (!plausible) {', a: 'if (false) {', puerta: 'extraccion' },
  { regla: 'Etiqueta ambigua pide confirmación', archivo: 'src/ia/extraccion.ts', de: "lecturas[p] =", a: "lecturas[p] = { tipo: 'ninguna' } as Lectura; void 0 ||", puerta: 'integracion' },
  { regla: 'Un dígito de código no es una cifra', archivo: 'src/ia/extraccion.ts', de: "const num = INICIO_DE_CIFRA + '", a: "const num = '' + '", puerta: 'integracion' },
  { regla: 'Número reclamado por otra etiqueta no cuenta', archivo: 'src/ia/extraccion.ts', de: '.filter((v) => !reclamadosPorOtros.has(v));', a: ';', puerta: 'integracion' },
  { regla: 'Los tres campos necesitan etiqueta', archivo: 'src/ia/extraccion.ts', de: 'sinConfirmar.push(papel);', a: 'void papel;', puerta: 'extraccion' },
  { regla: 'Falta de etiqueta marca ambigua', archivo: 'src/ia/extraccion.ts', de: 'return { ok: true, ambigua: sinConfirmar.length > 0, sinConfirmar };', a: 'return { ok: true, ambigua: false, sinConfirmar };', puerta: 'extraccion' },
  { regla: 'La extracción NO juzga la aritmética', archivo: 'src/ia/extraccion.ts', de: 'const etiquetado = porEtiquetas(cita);', a: 'if (Math.round(cantidad * precio * 100) !== Math.round(importe * 100)) return { ok: false, razón: 0 as never };\n  const etiquetado = porEtiquetas(cita);', puerta: 'extraccion' },
  { regla: 'Las dudas de lectura llegan al dictamen', archivo: 'src/dominio/motor.ts', de: 'razonesRevision.push(...dudasDeLectura);', a: 'void dudasDeLectura;', puerta: 'integracion' },
  { regla: 'Descripción respaldada por la cita', archivo: 'src/ia/extraccion.ts', de: 'if (!textoRespaldadoPor(l.descripcion, l.cita)) {', a: 'if (false) {', puerta: 'extraccion' },
  { regla: 'Calidad respaldada por la cita', archivo: 'src/ia/extraccion.ts', de: 'if (textoRespaldadoPor(l.calidad, l.cita)) {', a: 'if (true) {', puerta: 'extraccion' },
  { regla: 'Elemento de línea validado como objeto', archivo: 'src/ia/extraccion.ts', de: "if (typeof lc !== 'object' || lc === null || Array.isArray(lc)) {", a: 'if (false) {', puerta: 'extraccion' },
  { regla: 'Fecha equivalente, no literal', archivo: 'src/ia/extraccion.ts', de: 'const variantes = [', a: 'const variantes: string[] = [] || [', puerta: 'extraccion' },
  { regla: 'Porcentaje no calculable sin conciliar', archivo: 'src/dominio/motor.ts', de: 'const pct = documentoConcilia ? porcentaje(totalObjetado, f.totalDeclarado) : null;', a: 'const pct = porcentaje(totalObjetado, f.totalDeclarado);' },
  { regla: 'Duplicado ambiguo exige revisión', archivo: 'src/dominio/motor.ts', de: 'const idéntico = previo.cantidad === l.cantidad && previo.precioUnitario === l.precioUnitario;', a: 'const idéntico = true;' },
  { regla: 'Duplicado ambiguo detectado', archivo: 'src/dominio/motor.ts', de: 'posibleDuplicado = true;', a: 'posibleDuplicado = false;' },
  { regla: 'DUPLICADO_ENTRE_FACTURAS', archivo: 'src/dominio/motor.ts', de: '} else if (previos.has(l.codigo)) {', a: '} else if (false) {' },
  { regla: 'ZONA_INCOHERENTE', archivo: 'src/dominio/motor.ts', de: 'if (!general && !coincide) {', a: 'if (false) {' },
  { regla: 'FUERA_DE_TARIFARIO', archivo: 'src/dominio/motor.ts', de: 'if (!partida) {\n    cierreTotal = true;', a: 'if (false) {\n    cierreTotal = true;' },
  { regla: 'ARITMETICA_LINEA', archivo: 'src/dominio/motor.ts', de: 'if (aritmetico !== facturado) {', a: 'if (false) {' },
  { regla: 'TOTAL_INCOHERENTE', archivo: 'src/dominio/motor.ts', de: 'if (f.totalDeclarado !== f.subtotalDeclarado + f.itbmsDeclarado) {', a: 'if (false) {' },
  { regla: 'Subtotal contra suma de líneas', archivo: 'src/dominio/motor.ts', de: 'if (sumaLineas !== f.subtotalDeclarado) {', a: 'if (false) {' },
  { regla: 'Documento que no concilia no paga', archivo: 'src/dominio/motor.ts', de: 'const totalAPagar = documentoConcilia', a: 'const totalAPagar = true' },
  { regla: 'Total declarado se conserva', archivo: 'src/dominio/motor.ts', de: 'totalFacturado: f.totalDeclarado,\n    totalCalculado,', a: 'totalFacturado: totalCalculado,\n    totalCalculado,' },
  { regla: 'Validación de entrada', archivo: 'src/dominio/motor.ts', de: "const problemas = validarFactura(entrada);\n  if (problemas.length > 0) {", a: "const problemas: string[] = [];\n  if (problemas.length > 0) {" },
  { regla: 'textoOriginal validado', archivo: 'src/dominio/validacion.ts', de: "if (l?.textoOriginal !== undefined && !esTextoUtil(l.textoOriginal)) {", a: 'if (false) {' },
  { regla: 'calidad validada contra catálogo', archivo: 'src/dominio/validacion.ts', de: "if (l?.calidad !== undefined && !CALIDADES.has(l.calidad as string)) {", a: 'if (false) {' },
  { regla: 'Objetado separado de por-conciliar', archivo: 'src/dominio/motor.ts', de: ': Math.max(0, sumaLineas - totalReconocido); // solo lo que las líneas objetan', a: ': Math.max(0, f.totalDeclarado - totalAPagar);' },
  { regla: 'Cantidad positiva', archivo: 'src/dominio/validacion.ts', de: 'if (v <= 0 || v > 10_000) return false;', a: 'if (v > 10_000) return false;' },
  { regla: 'Factura sin líneas', archivo: 'src/dominio/validacion.ts', de: "p.push('La factura no tiene ninguna línea: no hay nada que auditar.');", a: 'void 0;' },
  { regla: 'Fecha real', archivo: 'src/dominio/validacion.ts', de: "const existe = Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d.fecha;", a: 'const existe = true;' },
  { regla: 'Cierre no reparte dinero extra', archivo: 'src/dominio/motor.ts', de: 'let porRepartir = cierreTotal ? 0 : objetadoParcial;', a: 'let porRepartir = objetadoParcial;' },
  { regla: 'Estado de línea desde la línea', archivo: 'src/dominio/motor.ts', de: 'la.estado = la.requiereRevision\n      ? \'DERIVADA\'', a: "la.estado = false\n      ? 'DERIVADA'" },
  { regla: 'Cita reconstruida exige revisión', archivo: 'src/dominio/motor.ts', de: "if (c.origen === 'reconstruida') {", a: 'if (false) {' },
  { regla: 'Autorización pendiente frena la conformidad', archivo: 'src/dominio/motor.ts', de: 'for (const la of lineas) razonesRevision.push(...la.razonesRevision);', a: 'void lineas;' },
  { regla: 'TOPE_MATERIALES', archivo: 'src/dominio/motor.ts', de: 'if (materialesReconocidos > tope) {', a: 'if (false) {' },
  { regla: 'TOPE_MATERIALES (valor)', archivo: 'src/dominio/motor.ts', de: 'export const TOPE_MATERIALES = 0.35;', a: 'export const TOPE_MATERIALES = 0.5;' },
  { regla: 'ARITMETICA_TOTAL', archivo: 'src/dominio/motor.ts', de: 'if (sumaLineas !== f.subtotalDeclarado) {', a: 'if (false) {' },
  { regla: 'ITBMS_INCORRECTO', archivo: 'src/dominio/motor.ts', de: 'if (f.itbmsDeclarado !== itbmsEsperado) {', a: 'if (false) {' },
  { regla: 'ITBMS (tasa)', archivo: 'src/dominio/dinero.ts', de: 'export const ITBMS = 0.07;', a: 'export const ITBMS = 0.1;' },
  { regla: 'EXCEDE_SUMA_ASEGURADA', archivo: 'src/dominio/motor.ts', de: 'if (totalReconocido > s.sumaAsegurada) {', a: 'if (false) {' },
  { regla: 'PLACA_NO_COINCIDE', archivo: 'src/dominio/motor.ts', de: "if (s.placa.toUpperCase() !== f.placa.toUpperCase()) {", a: 'if (false) {' },
  { regla: 'SINIESTRO_CERRADO', archivo: 'src/dominio/motor.ts', de: "if (s.estado === 'cerrado') {", a: 'if (false) {' },
  { regla: 'FUERA_DE_VIGENCIA', archivo: 'src/dominio/motor.ts', de: 'if (f.fecha < s.vigenciaDesde || f.fecha > s.vigenciaHasta) {', a: 'if (false) {' },
  { regla: 'FACTURA_ANTERIOR_AL_SINIESTRO', archivo: 'src/dominio/motor.ts', de: 'if (f.fecha < s.fechaOcurrencia) {', a: 'if (false) {' },
  { regla: 'TALLER_NO_AUTORIZADO', archivo: 'src/dominio/motor.ts', de: 'if (!taller || !taller.enRed || s.tallerAsignado !== f.taller) {', a: 'if (false) {' },
  { regla: 'TALLER (solo red, sin asignado)', archivo: 'src/dominio/motor.ts', de: 'if (!taller || !taller.enRed || s.tallerAsignado !== f.taller) {', a: 'if (!taller || !taller.enRed) {' },
  { regla: 'SINIESTRO_INEXISTENTE', archivo: 'src/dominio/motor.ts', de: 'const s = env.siniestros.get(f.siniestro);\n  if (!s) {', a: 'const s = env.siniestros.get(f.siniestro) ?? [...env.siniestros.values()][0];\n  if (!s) {' },
  { regla: 'UMBRAL de derivación', archivo: 'src/dominio/motor.ts', de: 'export const UMBRAL_PORCENTAJE = 40;', a: 'export const UMBRAL_PORCENTAJE = 95;' },
  { regla: 'Redondeo de centésimas', archivo: 'src/dominio/dinero.ts', de: 'const centesimas = Math.round(cantidad * 100);', a: 'const centesimas = cantidad * 100;' },
  { regla: 'No contar dos veces el cierre', archivo: 'src/dominio/motor.ts', de: 'if (cierreYaContado) return 0;', a: 'if (false) return 0;' },
];

const raiz = process.cwd();
let muertos = 0;
const sobrevivientes: string[] = [];
const caidas: string[] = [];

for (const m of MUTANTES) {
  const dir = mkdtempSync(join(tmpdir(), 'mutante-'));
  try {
    cpSync(join(raiz, 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(raiz, 'scripts'), join(dir, 'scripts'), { recursive: true });
    // node_modules se enlaza en vez de copiarse: son decenas de megas por
    // mutante y no cambian entre copias. La extracción lo necesita porque
    // importa el SDK de Anthropic (aunque nunca lo llame en las pruebas).
    try {
      symlinkSync(join(raiz, 'node_modules'), join(dir, 'node_modules'), 'dir');
    } catch {
      // Si no se puede enlazar, el mutante saldrá como no concluyente en vez
      // de contarse como muerto por una caída que no prueba nada.
    }

    const ruta = join(dir, m.archivo);
    const original = readFileSync(ruta, 'utf8');
    if (!original.includes(m.de)) {
      sobrevivientes.push(`${m.regla} — el patrón ya no existe en ${m.archivo}`);
      continue;
    }
    writeFileSync(ruta, original.replace(m.de, m.a));

    // Un mutante solo cuenta como muerto si el guantelete FALLÓ UNA ASERCIÓN
    // (código 2 más el sello en la salida). Si el proceso se cayó, el
    // guantelete no detectó nada: lo detectó el compilador, y eso no prueba
    // que la regla esté cubierta.
    let codigo = 0;
    let salida = '';
    try {
      const guiones: Record<string, string[]> = {
        extraccion: ['--experimental-strip-types', 'scripts/check-extraccion.ts'],
        integracion: ['--experimental-strip-types', 'scripts/check-integracion.ts'],
        trampas: ['--experimental-strip-types', 'scripts/check-trampas.ts', '--estricto'],
      };
      const guion = guiones[m.puerta ?? 'trampas'];
      salida = execFileSync(process.execPath, guion, {
        cwd: dir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      codigo = err.status ?? -1;
      salida = err.stdout ?? '';
    }
    // El guantelete sale con código 2 y su sello; las otras puertas con 1 y
    // una sección "Fallos:". Distinguirlo importa: una caída del proceso no
    // es una detección.
    const detectado =
      m.puerta === undefined || m.puerta === 'trampas'
        ? codigo === 2 && salida.includes('GUANTELETE:FALLO')
        : codigo === 1 && salida.includes('Fallos:');
    if (detectado) {
      muertos++;
    } else if (codigo === 0) {
      sobrevivientes.push(`${m.regla} — el guantelete no lo notó`);
    } else {
      caidas.push(`${m.regla} — el proceso se cayó (código ${codigo}); no lo probó el guantelete`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
console.log('  MUTANTES — ¿el guantelete prueba lo que dice probar?');
console.log('  ' + '-'.repeat(58));
console.log(`  Mutantes muertos  ${muertos} de ${MUTANTES.length}`);
if (caidas.length) {
  console.log(`  No concluyentes   ${caidas.length}`);
}
if (sobrevivientes.length) {
  console.log('');
  console.log('  Sobrevivientes (reglas sin prueba que las sostenga):');
  for (const s of sobrevivientes) console.log(`    ${s}`);
}
if (caidas.length) {
  console.log('');
  console.log('  No concluyentes:');
  for (const s of caidas) console.log(`    ${s}`);
}
console.log('');
process.exit(sobrevivientes.length || caidas.length ? 1 : 0);
