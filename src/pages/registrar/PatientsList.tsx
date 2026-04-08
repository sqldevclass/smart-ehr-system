import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import RegisterPatientSheet from "@/components/registrar/RegisterPatientSheet";

export default function PatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: patients = [], isLoading, refetch } = useQuery({
    queryKey: ["patients", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, date_of_birth, phone, created_at, primary_physician_id")
        .eq("hospital_id", user.hospitalId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch physician names
      const physicianIds = [...new Set((data || []).map((p) => p.primary_physician_id).filter(Boolean))];
      let physicianMap: Record<string, string> = {};
      if (physicianIds.length > 0) {
        const { data: physicians } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", physicianIds);
        physicianMap = Object.fromEntries((physicians || []).map((p) => [p.id, p.full_name || "Unknown"]));
      }

      return (data || []).map((p) => ({
        ...p,
        physician_name: p.primary_physician_id ? physicianMap[p.primary_physician_id] || "—" : "—",
      }));
    },
    enabled: !!user,
  });

  const filtered = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

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
        <Button onClick={() => setSheetOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Register New Patient
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading patients…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No patients found.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Primary Physician</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/registrar/patients/${p.id}`)}
                >
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.date_of_birth ? format(new Date(p.date_of_birth), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>{p.physician_name}</TableCell>
                  <TableCell>{format(new Date(p.created_at), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RegisterPatientSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        hospitalId={user?.hospitalId || ""}
        userId={user?.id || ""}
        onSuccess={() => {
          refetch();
          setSheetOpen(false);
        }}
      />
    </div>
  );
}
