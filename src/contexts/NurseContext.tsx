import { createContext, useContext, useState, ReactNode } from "react";
import { InpatientProvider, useInpatientContext } from "@/contexts/InpatientContext";

interface NurseContextValue {
  selectedDeptIds: string[];
  setSelectedDeptIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  nameSearch: string;
  setNameSearch: (s: string) => void;
  tabletMode: boolean;
  setTabletMode: (v: boolean) => void;
}

const NurseContext = createContext<NurseContextValue | null>(null);

function NurseInner({ children }: { children: ReactNode }) {
  const inp = useInpatientContext();
  const [tabletMode, setTabletMode] = useState(false);
  return (
    <NurseContext.Provider
      value={{
        selectedDeptIds: inp.selectedDeptIds,
        setSelectedDeptIds: inp.setSelectedDeptIds,
        nameSearch: inp.nameSearch,
        setNameSearch: inp.setNameSearch,
        tabletMode,
        setTabletMode,
      }}
    >
      {children}
    </NurseContext.Provider>
  );
}

export function NurseProvider({ children }: { children: ReactNode }) {
  return (
    <InpatientProvider>
      <NurseInner>{children}</NurseInner>
    </InpatientProvider>
  );
}

export function useNurseContext() {
  const ctx = useContext(NurseContext);
  if (!ctx) throw new Error("useNurseContext must be used within NurseProvider");
  return ctx;
}
