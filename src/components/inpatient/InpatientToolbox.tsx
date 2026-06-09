import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useInpatientContext } from "@/contexts/InpatientContext";

interface Props {
  physicianId: string;
  hospitalId: string;
  showRecentPatients?: boolean;
  listPath?: string;
  detailPathPrefix?: string;
}

interface SearchProps {
  search: string;
  hospitalId: string;
  selectedDeptIds: string[];
  onSelect: (hospId: string) => void;
}

function SearchResultsDropdown({ search, hospitalId, selectedDeptIds, onSelect }: SearchProps) {
  const { data: results = [] } = useQuery({
    queryKey: ["inpatient-search", hospitalId, selectedDeptIds, search],
    queryFn: async () => {
      if (!selectedDeptIds.length) return [];
      const { data } = await supabase
        .from("hospitalizations")
        .select(`id, patients!inner(first_name, last_name, patient_number)`)
        .eq("hospital_id", hospitalId)
        .is("discharged_at", null)
        .in("department_id", selectedDeptIds)
        .limit(20);
      const q = search.toLowerCase();
      return (data || []).filter((h: any) => {
        const p = h.patients;
        if (!p) return false;
        return (
          `${p.last_name} ${p.first_name}`.toLowerCase().includes(q) ||
          (p.patient_number || "").toLowerCase().includes(q)
        );
      });
    },
    enabled: search.length >= 2 && selectedDeptIds.length > 0,
  });

  return (
    <div className="absolute top-full left-0 w-64 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto mt-1">
      {results.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">Не найдено</div>
      ) : (
        results.map((h: any) => (
          <div
            key={h.id}
            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
            onClick={() => onSelect(h.id)}
          >
            <div className="font-medium">
              {h.patients?.last_name} {h.patients?.first_name}
            </div>
            <div className="text-xs text-muted-foreground">{h.patients?.patient_number}</div>
          </div>
        ))
      )}
    </div>
  );
}

export default function InpatientToolbox({
  physicianId,
  hospitalId,
  showRecentPatients = true,
  listPath = "/physician/inpatient",
  detailPathPrefix = "/physician/inpatient/",
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    selectedDeptIds,
    setSelectedDeptIds,
    nameSearch,
    setNameSearch,
  } = useInpatientContext();

  const [deptOpen, setDeptOpen] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recentShowAll, setRecentShowAll] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const isDetailPage =
    location.pathname.startsWith(detailPathPrefix) &&
    location.pathname !== listPath;

  const { data: departments = [] } = useQuery({
    queryKey: ["toolbox-departments", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!hospitalId,
  });

  const { data: physicianDept } = useQuery({
    queryKey: ["toolbox-physician-dept", physicianId],
    queryFn: async () => {
      const { data: sr } = await supabase
        .from("staff_roles")
        .select("person_id")
        .eq("id", physicianId)
        .maybeSingle();

      if (!sr?.person_id) return null;

      const { data: emp } = await supabase
        .from("employments")
        .select("department_id")
        .eq("person_id", sr.person_id)
        .eq("employment_status", "active")
        .maybeSingle();

      return emp?.department_id || null;
    },
    enabled: !!physicianId,
  });

  useEffect(() => {
    if (physicianDept && selectedDeptIds.length === 0) {
      setSelectedDeptIds([physicianDept]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicianDept]);

  const { data: recentPatients = [] } = useQuery({
    queryKey: ["recent-patients", physicianId, hospitalId],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase
        .from("physician_recent_patients")
        .select(
          `patient_id, hospitalization_id, viewed_at, patients!inner(first_name, last_name, patient_number)`,
        )
        .eq("staff_role_id", physicianId)
        .eq("hospital_id", hospitalId)
        .order("viewed_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: showRecentPatients && !!physicianId && !!hospitalId,
  });

  const handleDeptChange = (ids: string[]) => {
    setSelectedDeptIds(ids);
    if (isDetailPage) navigate(listPath);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={deptOpen} onOpenChange={setDeptOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1">
            Отделения
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem
            checked={
              departments.length > 0 && selectedDeptIds.length === departments.length
            }
            onCheckedChange={(checked) =>
              handleDeptChange(checked ? departments.map((d: any) => d.id) : [])
            }
          >
            Все отделения
          </DropdownMenuCheckboxItem>
          {departments.map((d: any) => (
            <DropdownMenuCheckboxItem
              key={d.id}
              checked={selectedDeptIds.includes(d.id)}
              onCheckedChange={(checked) =>
                handleDeptChange(
                  checked
                    ? [...selectedDeptIds, d.id]
                    : selectedDeptIds.filter((id) => id !== d.id),
                )
              }
            >
              {d.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {showRecentPatients && (
      <DropdownMenu open={showRecent} onOpenChange={setShowRecent}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            Последние пациенты
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          {recentPatients.length === 0 ? (
            <DropdownMenuItem disabled>Нет недавних пациентов</DropdownMenuItem>
          ) : (
            <>
              {(recentShowAll ? recentPatients : recentPatients.slice(0, 10)).map(
                (r: any) => (
                  <DropdownMenuItem
                    key={`${r.patient_id}-${r.hospitalization_id}`}
                    onClick={() => {
                      navigate(`${detailPathPrefix}${r.hospitalization_id}`);
                      setShowRecent(false);
                      setRecentShowAll(false);
                    }}
                  >
                    <div>
                      <div className="font-medium text-sm">
                        {r.patients?.last_name} {r.patients?.first_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.patients?.patient_number}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ),
              )}
              {!recentShowAll && recentPatients.length > 10 && (
                <DropdownMenuItem
                  onClick={() => setRecentShowAll(true)}
                  className="text-primary text-sm justify-center"
                >
                  Показать ещё ({recentPatients.length - 10})
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      <div className="relative">
        <Input
          placeholder="Поиск по ФИО или ID..."
          value={nameSearch}
          onChange={(e) => {
            setNameSearch(e.target.value);
            setShowSearchResults(e.target.value.length >= 2);
          }}
          className="w-52 h-8 text-sm"
        />
        {showSearchResults && nameSearch.length >= 2 && (
          <SearchResultsDropdown
            search={nameSearch}
            hospitalId={hospitalId}
            selectedDeptIds={selectedDeptIds}
            onSelect={(hospId) => {
              navigate(`${detailPathPrefix}${hospId}`);
              setShowSearchResults(false);
              setNameSearch("");
            }}
          />
        )}
      </div>
    </div>
  );
}
