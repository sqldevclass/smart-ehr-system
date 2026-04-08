import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function MyPatientsList() {
  const { physicianId, isLoading: physicianLoading, user } = usePhysicianId();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["physician-patients", physicianId],
    queryFn: async () => {
      if (!physicianId || !user) return [];

      // Get patients where primary_physician_id = this physician's id
      const { data: patientsData, error } = await supabase
        .from("patients")
        .select("id, full_name, date_of_birth, phone")
        .eq("hospital_id", user.hospitalId)
        .eq("primary_physician_id", physicianId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get latest examination card for each patient
      const patientIds = (patientsData || []).map((p) => p.id);
      let examMap: Record<string, { admission_date: string; status: string }> = {};

      if (patientIds.length > 0) {
        const { data: exams } = await supabase
          .from("examination_cards")
          .select("patient_id, admission_date, status")
          .in("patient_id", patientIds)
          .order("admission_date", { ascending: false });

        // Keep only the latest per patient
        for (const ex of exams || []) {
          if (!examMap[ex.patient_id]) {
            examMap[ex.patient_id] = { admission_date: ex.admission_date, status: ex.status };
          }
        }
      }

      return (patientsData || []).map((p) => ({
        ...p,
        lastVisit: examMap[p.id]?.admission_date || null,
        latestStatus: examMap[p.id]?.status || null,
      }));
    },
    enabled: !!physicianId && !!user,
  });

  const filtered = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (physicianLoading || isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!physicianId) {
    return <p className="text-sm text-destructive">No physician record found for your account.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search patients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No patients found.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/physician/patients/${p.id}`)}
                >
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>
                    {p.date_of_birth ? format(new Date(p.date_of_birth), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>
                    {p.lastVisit ? format(new Date(p.lastVisit), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    {p.latestStatus ? (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          p.latestStatus === "open"
                            ? "bg-accent/10 text-accent"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.latestStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
