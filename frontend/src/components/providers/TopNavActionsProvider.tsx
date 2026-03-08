"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import type { ReactNode } from "react";

const TopNavActionsContext = createContext<{
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
}>({ actions: null, setActions: () => {} });

export function TopNavActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <TopNavActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </TopNavActionsContext.Provider>
  );
}

export function useTopNavActions() {
  const { setActions } = useContext(TopNavActionsContext);
  return useCallback(
    (node: ReactNode) => {
      setActions(node);
    },
    [setActions],
  );
}

export function useTopNavActionsValue() {
  const { actions } = useContext(TopNavActionsContext);
  return actions;
}
