import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start gap-4 px-4 py-20 sm:px-6">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="max-w-xl text-muted-foreground">
        Puede que la dirección no sea correcta o que el contenido todavía no sea público.
      </p>
      <Button asChild size="lg">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
