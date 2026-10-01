"use client"; // Los error boundaries de Next deben ser Client Components.

import { Button } from "@/components/ui/button";

/**
 * Error al cargar un panel. No muestra detalles técnicos (ni error.message):
 * el identificador `digest` permite buscar el error en los registros del servidor.
 */
export default function PanelError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <h1 className="text-2xl font-semibold tracking-tight">No pudimos cargar el panel</h1>
      <p className="max-w-xl text-muted-foreground">Intenta de nuevo en unos minutos.</p>
      <Button size="lg" onClick={() => retry()}>
        Intentar de nuevo
      </Button>
    </section>
  );
}
