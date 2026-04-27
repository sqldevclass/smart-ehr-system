import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Physician {
  id: string;
  specialization: string | null;
  profiles: { full_name: string | null } | null;
}

export default function PhysicianPrivilegesPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: physicians = [], isLoading } = useQuery({
    queryKey: ["physicians-active", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("physicians")
        .select("id, specialization, profiles!inner(full_name)")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as unknown as Physician[];
    },
    enabled: !!user,
  });

  const { data: servicePrivileges = [] } = useQuery({
    queryKey: ["physician-service-privileges", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select("*")
        .eq("physician_id", selectedId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const { data: documentPrivileges = [] } = useQuery({
    queryKey: ["physician-document-privileges", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("physician_document_privileges")
        .select("*")
        .eq("physician_id", selectedId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const selected = physicians.find((p) => p.id === selectedId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Physician Privileges</h1>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div className="rounded-lg border bg-card p-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-2 py-1.5">
            Physicians
          </h2>
          {isLoading ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
          ) : physicians.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No physicians yet.</p>
          ) : (
            <ul className="space-y-1">
              {physicians.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                      selectedId === p.id && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    <div>{p.profiles?.full_name || "Unknown"}</div>
                    {p.specialization && (
                      <div className="text-xs text-muted-foreground">{p.specialization}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a physician to view privileges.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {selected.profiles?.full_name}
                </h2>
                {selected.specialization && (
                  <p className="text-sm text-muted-foreground">{selected.specialization}</p>
                )}
              </div>

              <Tabs defaultValue="services">
                <TabsList>
                  <TabsTrigger value="services">Service Privileges</TabsTrigger>
                  <TabsTrigger value="documents">Document Privileges</TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="mt-4">
                  {/* TODO Phase 2: replace with services checkbox list */}
                  {servicePrivileges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No services configured yet. Services will be available after the service catalog is set up.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {servicePrivileges.map((sp: any) => (
                        <li key={sp.id} className="text-sm">{sp.service_id}</li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="documents" className="mt-4">
                  {/* TODO Phase 7: replace with document types checkbox list */}
                  {documentPrivileges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No document types configured yet. Document types will be available after documents are set up.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {documentPrivileges.map((dp: any) => (
                        <li key={dp.id} className="text-sm">{dp.document_type_id}</li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
