'use client';

import { formato } from '../src/dominio/dinero';
import type { Dictamen } from '../src/dominio/tipos';

const ETIQUETA: Record<string, string> = {
  CONFORME: 'Conforme',
  OBJETADA_PARCIAL: 'Objetada',
  OBJETADA: 'Objetada',
  RECHAZADA: 'Rechazada',
  DERIVADA: 'A perito',
  PENDIENTE: 'Pendiente',
  INVALIDA: 'No procesable',
};

/**
 * El panel completo de un dictamen: resumen de montos, avisos de revisión y
 * conciliación, motivos a nivel de factura, y cada línea con sus motivos.
 * Usado tanto por la bandeja de ejemplos como por el formulario de factura
 * nueva — un solo lugar que muestra TODO lo que el motor devuelve, para que
 * las dos pantallas nunca queden desincronizadas entre sí.
 */
export default function PanelDictamen({ dictamen: d, nota }: { dictamen: Dictamen; nota?: string }) {
  return (
    <>
      <div className="panel__cab">
        <h3>
          Dictamen · {d.factura} · {d.siniestro}
        </h3>
        <span className={`insignia insignia--${d.estado}`}>{ETIQUETA[d.estado]}</span>
      </div>

      <div className="dictamen__resumen">
        <div className="dictamen__celda">
          <span>Cobrado</span>
          <strong className="mono">{formato(d.totalFacturado)}</strong>
        </div>
        <div className="dictamen__celda dictamen__celda--objetado">
          <span>Objetado (con hallazgo)</span>
          <strong className="mono">
            {formato(d.totalObjetado)}
            {d.totalObjetado > 0 && d.documentoConcilia && (
              <em style={{ fontStyle: 'normal', fontSize: 13, opacity: 0.7 }}> · {d.porcentajeObjetado}%</em>
            )}
          </strong>
        </div>
        {d.montoPorConciliar > 0 && (
          <div className="dictamen__celda dictamen__celda--conciliar">
            <span>Por conciliar</span>
            <strong className="mono">{formato(d.montoPorConciliar)}</strong>
          </div>
        )}
        <div className="dictamen__celda dictamen__celda--pagar">
          <span>Importe reconocido preliminar</span>
          <strong className="mono">{formato(d.totalAPagar)}</strong>
        </div>
        <div className="dictamen__celda">
          <span>Motor determinista</span>
          <strong className="mono">{d.ms.toFixed(2)} ms</strong>
        </div>
      </div>

      {d.requiereRevision && (
        <div className="aviso">
          <strong>No procede pagar todavía. Decide una persona.</strong>
          <ul>
            {d.razonesRevision.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {!d.documentoConcilia && d.estado !== 'INVALIDA' && (
        <p className="aviso aviso--dato mono">
          Declarado {formato(d.totalFacturado)} · las líneas más ITBMS dan {formato(d.totalCalculado)}
        </p>
      )}

      {nota && (
        <p
          style={{
            margin: 0,
            padding: '13px 22px',
            fontSize: 12.5,
            color: 'var(--texto-3)',
            borderBottom: '1px solid var(--borde-suave)',
            lineHeight: 1.55,
          }}
        >
          {nota}
        </p>
      )}

      {d.motivosFactura.length > 0 && (
        <div style={{ padding: '14px 22px 4px' }}>
          {d.motivosFactura.map((m, i) => (
            <Motivo key={i} m={m} />
          ))}
        </div>
      )}

      {d.lineas.length === 0 ? (
        <div className="vacio">
          {d.estado === 'INVALIDA'
            ? 'La factura no pasó las puertas de admisión, así que sus líneas no se auditaron.'
            : 'No hay líneas que mostrar.'}
        </div>
      ) : (
        <div className="lineas">
          {d.lineas.map((l) => (
            <div className="linea" key={l.indice}>
              <div className="linea__cab">
                <div>
                  <div className="linea__desc">{l.cruda.descripcion}</div>
                  <div className="linea__cod mono">
                    {l.cruda.codigo ?? '(sin código)'} · {l.cruda.cantidad} × {formato(l.cruda.precioUnitario)}
                  </div>
                </div>
                <div className="linea__montos mono">
                  {formato(l.cruda.importe)}
                  {l.montoObjetado > 0 && (
                    <>
                      <br />
                      <b>−{formato(l.montoObjetado)}</b>
                    </>
                  )}
                </div>
              </div>
              {l.motivos.map((m, i) => (
                <Motivo key={i} m={m} />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Motivo({ m }: { m: Dictamen['lineas'][number]['motivos'][number] }) {
  return (
    <div className={`motivo${m.monto === 0 ? ' motivo--informativo' : ''}`}>
      <div className="motivo__cab">
        <span className="motivo__cod mono">
          {m.codigo}
          {m.monto > 0 && ` · ${formato(m.monto)}`}
        </span>
        <span className="motivo__clausula mono">Cláusula {m.clausula}</span>
      </div>
      <p className="motivo__detalle">{m.detalle}</p>
      <p className="motivo__cita mono">
        <span className={`procedencia procedencia--${m.origenCita}`}>
          {m.origenCita === 'documento' ? 'del documento' : 'reconstruida'}
        </span>
        {m.cita}
      </p>
    </div>
  );
}
