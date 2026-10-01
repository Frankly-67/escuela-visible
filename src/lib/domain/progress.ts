/**
 * Progreso de una necesidad para mostrar en la interfaz.
 * Dos medidas separadas: lo COMPROMETIDO por aliados y lo CONFIRMADO por la
 * escuela. Solo lo confirmado cuenta como recibido.
 */
export type NeedProgress = {
  goal: number;
  committed: number;
  confirmed: number;
  /** 0–100, redondeado hacia abajo (nunca muestra 100 % antes de tiempo). */
  committedPercent: number;
  confirmedPercent: number;
};

const percent = (part: number, goal: number) =>
  goal > 0 ? Math.min(100, Math.max(0, Math.floor((part / goal) * 100))) : 0;

export function computeProgress(goal: number, committed = 0, confirmed = 0): NeedProgress {
  return {
    goal,
    committed,
    confirmed,
    committedPercent: percent(committed, goal),
    confirmedPercent: percent(confirmed, goal),
  };
}
