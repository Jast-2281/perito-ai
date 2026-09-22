import { auditar } from '../src/dominio/motor.ts';
import { entornoPorDefecto } from '../src/dominio/entorno.ts';
import { construirFactura } from '../src/datos/constructor.ts';
import { TRAMPAS } from '../src/datos/trampas.ts';
import { formato } from '../src/dominio/dinero.ts';
import type { Dictamen, FacturaCruda } from '../src/dominio/tipos.ts';
import Bandeja from './Bandeja.tsx';
import FormularioFactura from './FormularioFactura.tsx';

export const dynamic = 'force-static';

export default function Pagina() {
  const env = entornoPorDefecto();

  const casos = TRAMPAS.map((t) => {
    // Dos casos del corpus prueban la puerta de entrada con datos crudos
    // (null, undefined): no pasan por el constructor, van directo al motor,
    // igual que en el guantelete.
    const factura = t.crudo
      ? (t.factura as unknown as FacturaCruda)
      : construirFactura(t.factura);
    const dictamen: Dictamen = auditar(factura, env);
    return { id: t.id, nota: t.nota, factura, dictamen };
  });

  const totalFacturado = casos.reduce((a, c) => a + c.dictamen.totalFacturado, 0);
  const totalObjetado = casos.reduce((a, c) => a + c.dictamen.totalObjetado, 0);
  const conObjecion = casos.filter((c) => c.dictamen.estado !== 'CONFORME').length;
  const msMax = Math.max(...casos.map((c) => c.dictamen.ms));

  return (
    <div className="envoltura">
      <header className="cabecera">
        <div className="marca">
          <div className="marca__glifo" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="#061d30" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.4 15.4 21 21" />
              <path d="M7.8 10.6l2 2 3.6-4" />
            </svg>
          </div>
          <div className="marca__texto">
            <h1>PERITO AI</h1>
            <p>Auditoría de facturación de siniestros</p>
          </div>
        </div>
        <div className="sello">Prototipo · datos sintéticos</div>
      </header>

      <section className="titular">
        <h2>
          Ninguna objeción sin <em>la cláusula que la sostiene.</em>
        </h2>
        <p>
          Cada factura del taller se compara línea por línea contra el tarifario acordado, el daño
          reportado y lo ya pagado en el mismo siniestro. Toda objeción sale con su cláusula y con
          el fragmento del documento del que salió. Si el criterio es de un perito, el agente no
          decide: deriva.
        </p>
        <p className="titular__nota">
          <strong>Estado del prototipo:</strong> este prototipo permite auditar facturas nuevas
          mediante texto pegado. La IA extrae los campos y sus citas; un motor determinista
          verifica las reglas del tarifario. Incluye además un corpus de 80 facturas sintéticas
          para explorar distintos resultados.
        </p>
      </section>

      <p className="titular__nota">Resultados del corpus sintético de referencia</p>
      <section className="cifras">
        <div className="cifra">
          <div className="cifra__valor mono">{formato(totalFacturado)}</div>
          <div className="cifra__etq">Facturado por los talleres</div>
        </div>
        <div className="cifra cifra--acento">
          <div className="cifra__valor mono">{formato(totalObjetado)}</div>
          <div className="cifra__etq">Objetado con cláusula</div>
        </div>
        <div className="cifra">
          <div className="cifra__valor mono">
            {conObjecion}/{casos.length}
          </div>
          <div className="cifra__etq">Facturas con hallazgos</div>
        </div>
        <div className="cifra">
          <div className="cifra__valor mono">{msMax.toFixed(2)} ms</div>
          <div className="cifra__etq">Peor caso del motor determinista</div>
        </div>
      </section>

      <FormularioFactura />

      <h2 className="subtitulo">Corpus de referencia (precargado)</h2>
      <Bandeja casos={casos} />

      <footer className="pie">
        Pólizas, talleres, placas, siniestros y facturas son sintéticos, creados para el hackIAthon
        Panamá 2026. No corresponden a ninguna aseguradora ni taller real. El motor de decisión
        corre sin red y sin llamar a ningún modelo: las reglas, los montos y las cláusulas salen
        solo del tarifario. Un modelo de lenguaje interviene únicamente para leer una factura
        escrita en prosa y citar de dónde sale cada dato. Esa cita se comprueba contra el propio texto pegado antes de auditarse: si el fragmento no
        aparece ahí, el campo se descarta. Eso no verifica un PDF o imagen original, porque hoy
        no existe esa carga de archivo.
      </footer>
    </div>
  );
}
