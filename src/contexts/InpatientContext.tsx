import { createContext, useContext, useState, ReactNode } from "react";

interface InpatientContextValue {
  selectedDeptIds: string[];
  setSelectedDeptIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  nameSearch: string;
  setNameSearch: (s: string) => void;
  idSearch: string;
  setIdSearch: (s: string) => void;
}

const InpatientContext = createContext<InpatientContextValue | null>(null);

export function InpatientProvider({ children }: { children: ReactNode }) {
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [idSearch, setIdSearch] = useState("");

  return (
    <InpatientContext.Provider
      value={{
        selectedDeptIds,
        setSelectedDeptIds: setSelectedDeptIds as any,
        nameSearch,
        setNameSearch,
        idSearch,
        setIdSearch,
      }}
    >
      {children}
    </InpatientContext.Provider>
  );
}

export function useInpatientContext() {
  const ctx = useContext(InpatientContext);
  if (!ctx) throw new Error("useInpatientContext must be used within InpatientProvider");
  return ctx;
}
