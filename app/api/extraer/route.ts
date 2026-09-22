// Ruta de servidor. Corre en el servidor de Next.js, nunca en el navegador
// del visitante — por eso la clave de API es segura aquí: este archivo es el
// único lugar del proyecto que la lee (vía extraerFactura), y su resultado
// nunca incluye la clave.
//
// Flujo: texto pegado → extracción con IA y cita obligatoria → validación →
// motor determinista → dictamen. Cada paso puede detener el flujo sin
// reventar, y cada fallo vuelve como una respuesta clara, nunca como una
// página de error genérica.

import { NextResponse } from 'next/server';
import { extraerFactura } from '../../../src/ia/extraccion.ts';
import { auditar } from '../../../src/dominio/motor.ts';
import { entornoPorDefecto } from '../../../src/dominio/entorno.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITE_CARACTERES = 6000;
const env = entornoPorDefecto();

// Límite simple de uso: N solicitudes por minuto por proceso. Un hackathon
// no necesita más que esto, y sin él un enlace público es una factura
// abierta contra la clave de API de quien lo publicó.
const LIMITE_POR_MINUTO = 10;
const ventana = new Map<string, number[]>();

function permitido(ip: string): boolean {
  const ahora = Date.now();
  const marcas = (ventana.get(ip) ?? []).filter((t) => ahora - t < 60_000);
  if (marcas.length >= LIMITE_POR_MINUTO) {
    ventana.set(ip, marcas);
    return false;
  }
  marcas.push(ahora);
  ventana.set(ip, marcas);
  return true;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
  if (!permitido(ip)) {
    return NextResponse.json(
      { ok: false, etapa: 'limite', problemas: ['Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.'] },
      { status: 429 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, etapa: 'entrada', problemas: ['El cuerpo de la solicitud no es JSON válido.'] },
      { status: 400 },
    );
  }

  const texto = (cuerpo as { texto?: unknown } | null)?.texto;
  if (typeof texto !== 'string' || texto.trim().length === 0) {
    return NextResponse.json(
      { ok: false, etapa: 'entrada', problemas: ['Falta el texto de la factura.'] },
      { status: 400 },
    );
  }
  if (texto.length > LIMITE_CARACTERES) {
    return NextResponse.json(
      {
        ok: false,
        etapa: 'entrada',
        problemas: [`El texto supera el límite de ${LIMITE_CARACTERES} caracteres.`],
      },
      { status: 400 },
    );
  }

  const extraccion = await extraerFactura(texto);
  if (!extraccion.ok || !extraccion.factura) {
    return NextResponse.json(
      { ok: false, etapa: 'extraccion', problemas: extraccion.problemas, ms: extraccion.ms },
      { status: 200 },
    );
  }

  let dictamen;
  try {
    // Las ambigüedades de lectura entran al motor, no se reportan aparte.
    // Un dictamen que dice CONFORME junto a un aviso que dice "confirme esta
    // lectura" son dos mensajes contradictorios: quien lo lee no sabe si
    // puede pagar. El motor las convierte en PENDIENTE.
    dictamen = auditar(extraccion.factura, env, extraccion.ambiguas);
  } catch (e) {
    // No debería pasar nunca —el motor está hecho para no reventar— pero si
    // pasa, la respuesta lo dice en vez de devolver un error 500 genérico.
    return NextResponse.json(
      {
        ok: false,
        etapa: 'motor',
        problemas: [`El motor no pudo procesar la factura extraída: ${(e as Error).message}`],
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    etapa: 'listo',
    factura: extraccion.factura,
    dictamen,
    // Lecturas aceptadas que una persona debe confirmar. No impidieron la
    // auditoría, pero el perito tiene que verlas junto al dictamen.
    ambiguas: extraccion.ambiguas,
    msExtraccion: extraccion.ms,
  });
}
