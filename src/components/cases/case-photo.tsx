"use client";

import Image from "next/image";
import { useState } from "react";

import type { CasePhoto as CasePhotoData } from "@/content/documented-cases";

/**
 * Fotografía de un caso documentado. Si el archivo aún no está en public/,
 * muestra un marcador neutro en lugar de una imagen rota.
 */
export function CasePhoto({
  photo,
  sizes,
  preload = false,
  className = "",
}: {
  photo: CasePhotoData;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {failed ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          <span>
            <svg
              viewBox="0 0 24 24"
              className="mx-auto mb-2 size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m21 16-5-5-8 8" strokeLinejoin="round" />
            </svg>
            Fotografía no disponible
          </span>
        </div>
      ) : (
        <Image
          src={photo.file}
          alt={photo.alt}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
