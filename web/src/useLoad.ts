import { useCallback, useEffect, useState } from "react";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "failed"; error: Error };

export function useLoad<T>(load: () => Promise<T>): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (error: Error) => {
        console.error(error);
        if (current) setState({ status: "failed", error });
      },
    );
    return () => {
      current = false;
    };
    // `load` is a module-level function in every caller; re-run only on reload().
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
