'use client';

import { useState } from 'react';
import type { Dictamen, FacturaCruda } from '../src/dominio/tipos';
import PanelDictamen from './PanelDictamen';

type Estado =
  | { fase: 'inicio' }
  | { fase: 'cargando' }
  | { fase: 'error'; problemas: string[]; etapa: string }
  | { fase: 'listo'; factura: FacturaCruda; dictamen: Dictamen; msExtraccion: number; ambiguas: string[] };

const EJEMPLO = `Factura FAC-9001
Taller: TLR-001
Siniestro: SIN-2026-0141
Placa: AB1234
Fecha: 2026-07-20

1x Parachoques delantero (código REP-F-01) — B/.470.00
4h Desabolladura de panel (código MO-DES-01) a B/.28.00/h — B/.112.00

Subtotal: B/.582.00
ITBMS (7%): B/.40.74
Total: B/.622.74`;

export default function FormularioFactura() {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' });

  async function auditar() {
    if (!texto.trim()) return;
    setEstado({ fase: 'cargando' });
    try {
      const r = await fetch('/api/extraer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const datos = await r.json();
      if (!datos.ok) {
        setEstado({ fase: 'error', problemas: datos.problemas ?? ['Error desconocido.'], etapa: datos.etapa });
      } else {
        setEstado({
          fase: 'listo',
          factura: datos.factura,
          dictamen: datos.dictamen,
          msExtraccion: datos.msExtraccion,
          ambiguas: datos.ambiguas ?? [],
        });
      }
    } catch {
      setEstado({
        fase: 'error',
        etapa: 'red',
        problemas: ['No se pudo contactar al servidor. Revisa la conexión e inténtalo de nuevo.'],
      });
    }
  }

  return (
    <div className="panel panel--formulario">
      <div className="panel__cab">
        <h3>Auditar una factura nueva</h3>
        <span className="mono" style={{ fontSize: 11, color: 'var(--texto-3)' }}>
          texto libre → IA lee y cita → motor decide
        </span>
      </div>
      <div className="formulario__cuerpo">
        <textarea
          className="formulario__area mono"
          placeholder="Pega aquí el texto de una factura de taller…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Un dictamen de la factura anterior deja de describir lo que hay
            // en pantalla en cuanto se escribe otra cosa.
            if (estado.fase === 'listo' || estado.fase === 'error') setEstado({ fase: 'inicio' });
          }}
          rows={10}
        />
        <div className="formulario__acciones">
          <button
            className="boton boton--primario"
            type="button"
            onClick={auditar}
            disabled={estado.fase === 'cargando' || !texto.trim()}
          >
            {estado.fase === 'cargando' ? 'Leyendo la factura…' : 'Auditar factura'}
          </button>
          <button
            className="boton boton--fantasma"
            type="button"
            onClick={() => setTexto(EJEMPLO)}
            disabled={estado.fase === 'cargando'}
          >
            Usar un ejemplo
          </button>
          {/* Limpiar borra el texto Y el dictamen anterior: dejar el resultado
              viejo en pantalla mientras se escribe una factura nueva es
              información falsa sobre lo que está pasando. */}
          <button
            className="boton boton--tenue"
            type="button"
            onClick={() => {
              setTexto('');
              setEstado({ fase: 'inicio' });
            }}
            disabled={estado.fase === 'cargando' || (!texto.trim() && estado.fase === 'inicio')}
          >
            Limpiar
          </button>
        </div>

        {estado.fase === 'error' && (
          <div className="aviso aviso--error">
            <strong>No se pudo auditar esta factura.</strong>
            <ul>
              {estado.problemas.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {estado.fase === 'listo' && (
        <div className="resultado-nuevo">
          {estado.ambiguas.length > 0 && (
            <div className="aviso aviso--lectura">
              <strong>La lectura del documento necesita confirmación.</strong>
              <ul>
                {estado.ambiguas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <PanelDictamen dictamen={estado.dictamen} />
          <p className="resultado-nuevo__pie mono">
            extracción {estado.msExtraccion.toFixed(0)} ms · motor {estado.dictamen.ms.toFixed(2)} ms
          </p>
        </div>
      )}
    </div>
  );
}
