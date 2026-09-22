import type { Metadata } from 'next';
import './globals.css';

// Las fuentes se cargan por <link> y no por next/font a propósito: next/font
// las descarga en tiempo de compilación, y eso convierte una caída de Google
// Fonts en un build roto. Con <link>, la peor consecuencia es que se vea la
// tipografía de reserva.
export const metadata: Metadata = {
  title: 'PERITO AI · Auditoría de facturación de siniestros',
  description:
    'Audita las facturas del taller contra el tarifario acordado y objeta con la cláusula en la mano. El modelo lee y cita; el motor decide.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
