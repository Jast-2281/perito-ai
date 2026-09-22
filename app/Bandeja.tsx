'use client';

import { useState } from 'react';
import { formato } from '../src/dominio/dinero';
import type { Dictamen, FacturaCruda } from '../src/dominio/tipos';
import PanelDictamen from './PanelDictamen';

interface Caso {
  id: string;
  nota: string;
  factura: FacturaCruda;
  dictamen: Dictamen;
}

const ETIQUETA: Record<string, string> = {
  CONFORME: 'Conforme',
  OBJETADA_PARCIAL: 'Objetada',
  OBJETADA: 'Objetada',
  RECHAZADA: 'Rechazada',
  DERIVADA: 'A perito',
  PENDIENTE: 'Pendiente',
  INVALIDA: 'No procesable',
};

export default function Bandeja({ casos }: { casos: Caso[] }) {
  const [sel, setSel] = useState(0);
  const caso = casos[sel];

  return (
    <div className="tablero">
      <div className="panel">
        <div className="panel__cab">
          <h3>Bandeja de facturas</h3>
          <span className="mono" style={{ fontSize: 12, color: 'var(--texto-3)' }}>
            {casos.length}
          </span>
        </div>
        <div className="bandeja">
          {casos.map((c, i) => (
            <button key={c.id} className="item" aria-current={i === sel} onClick={() => setSel(i)}>
              <div className="item__fila">
                <span className="item__num mono">{c.dictamen.factura}</span>
                <span className={`insignia insignia--${c.dictamen.estado}`}>{ETIQUETA[c.dictamen.estado]}</span>
              </div>
              <div className="item__fila">
                <span className="item__nota mono" style={{ color: 'var(--texto-2)' }}>
                  {c.dictamen.siniestro}
                </span>
                <span className="item__nota mono">
                  {c.dictamen.totalObjetado > 0 ? formato(c.dictamen.totalObjetado) : '—'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <PanelDictamen dictamen={caso.dictamen} nota={caso.nota} />
      </div>
    </div>
  );
}
