import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Physician {
  id: string;
  persons: { first_name: string | null; last_name: string | null } | null;
  specializations: { name: string | null } | null;
}

interface ServiceRow {
  id: string;
  name: string;
  cost_with_vat: number | null;
  service_groups: {
    name: string | null;
    service_types: { name_ru: string | null } | null;
  } | null;
}

export default function PhysicianPrivilegesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: physicians = [], isLoading } = useQuery({
    queryKey: ["physicians-active", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name), specializations!specialization_id(name)")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as unknown as Physician[];
    },
    enabled: !!user,
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ["all-services", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_groups(name, service_types(name_ru))")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as ServiceRow[];
    },
    enabled: !!user,
  });

  const { data: currentPrivileges = [] } = useQuery({
    queryKey: ["physician-service-privileges", selectedId, user?.hospitalId],
    queryFn: async () => {
      if (!selectedId || !user) return [];
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select("service_id")
        .eq("physician_id", selectedId)
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId && !!user,
  });

  useEffect(() => {
    setChecked(new Set((currentPrivileges as { service_id: string }[]).map((p) => p.service_id)));
  }, [currentPrivileges]);

  const grouped = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const s of allServices) {
      const typeName = s.service_groups?.service_types?.name_ru || "Other";
      if (!map.has(typeName)) map.set(typeName, []);
      map.get(typeName)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allServices]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedId || !user) return;
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("physician_service_privileges")
        .delete()
        .eq("physician_id", selectedId)
        .eq("hospital_id", user.hospitalId);
      if (delErr) throw delErr;

      const rows = Array.from(checked).map((service_id) => ({
        physician_id: selectedId,
        service_id,
        hospital_id: user.hospitalId,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("physician_service_privileges")
          .insert(rows);
        if (insErr) throw insErr;
      }
      toast.success("Service privileges saved");
      queryClient.invalidateQueries({ queryKey: ["physician-service-privileges", selectedId, user.hospitalId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save privileges");
    } finally {
      setSaving(false);
    }
  };

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

  const { data: allDocTypes = [] } = useQuery({
    queryKey: ["all-document-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color")
        .eq("is_active", true)
        .order("name_ru");
      return data || [];
    },
  });

  const grantedDocTypeIds = new Set(
    documentPrivileges.map((p: any) => p.document_type_id)
  );

  const toggleDocPrivilege = async (docTypeId: string, granted: boolean) => {
    if (!selectedId || !user) return;
    if (granted) {
      await supabase.from("physician_document_privileges").insert({
        physician_id: selectedId,
        document_type_id: docTypeId,
        hospital_id: user.hospitalId,
        granted_by: user.id,
      });
    } else {
      await supabase
        .from("physician_document_privileges")
        .delete()
        .eq("physician_id", selectedId)
        .eq("document_type_id", docTypeId);
    }
    queryClient.invalidateQueries({
      queryKey: ["physician-document-privileges", selectedId],
    });
  };

  const { data: officeRooms = [] } = useQuery({
    queryKey: ["office-rooms-active", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_types!inner(name, is_office_room)")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .filter("room_types.is_office_room", "eq", true)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string }[];
    },
    enabled: !!user,
  });

  const { data: currentRoomAssignments = [] } = useQuery({
    queryKey: ["physician-office-rooms", selectedId, user?.hospitalId],
    queryFn: async () => {
      if (!selectedId || !user) return [];
      const { data, error } = await supabase
        .from("office_room_physicians")
        .select("room_id")
        .eq("physician_id", selectedId)
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return (data || []) as { room_id: string }[];
    },
    enabled: !!selectedId && !!user,
  });

  const [checkedRooms, setCheckedRooms] = useState<Set<string>>(new Set());
  const [savingRooms, setSavingRooms] = useState(false);

  useEffect(() => {
    setCheckedRooms(new Set(currentRoomAssignments.map((r) => r.room_id)));
  }, [currentRoomAssignments]);

  const toggleRoom = (id: string) => {
    setCheckedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveRooms = async () => {
    if (!selectedId || !user) return;
    setSavingRooms(true);
    try {
      const { error: delErr } = await supabase
        .from("office_room_physicians")
        .delete()
        .eq("physician_id", selectedId)
        .eq("hospital_id", user.hospitalId);
      if (delErr) throw delErr;
      const rows = Array.from(checkedRooms).map((room_id) => ({
        room_id,
        physician_id: selectedId,
        hospital_id: user.hospitalId,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("office_room_physicians").insert(rows);
        if (insErr) throw insErr;
      }
      toast.success("Office room assignments saved");
      queryClient.invalidateQueries({ queryKey: ["physician-office-rooms", selectedId, user.hospitalId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save assignments");
    } finally {
      setSavingRooms(false);
    }
  };

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
                    {p.specializations?.name && (
                      <div className="text-xs text-muted-foreground">{p.specializations.name}</div>
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
                {selected.specializations?.name && (
                  <p className="text-sm text-muted-foreground">{selected.specializations.name}</p>
                )}
              </div>

              <Tabs defaultValue="services">
                <TabsList>
                  <TabsTrigger value="services">Service Privileges</TabsTrigger>
                  <TabsTrigger value="documents">Document Privileges</TabsTrigger>
                  <TabsTrigger value="rooms">Office Room Assignments</TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="mt-4">
                  {allServices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active services in this hospital.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {grouped.map(([typeName, services]) => (
                        <div key={typeName} className="space-y-2">
                          <h3 className="text-sm font-semibold text-foreground">{typeName}</h3>
                          <ul className="space-y-1">
                            {services.map((s) => {
                              const id = `svc-${s.id}`;
                              return (
                                <li
                                  key={s.id}
                                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                                >
                                  <label
                                    htmlFor={id}
                                    className="flex items-center gap-3 text-sm cursor-pointer flex-1"
                                  >
                                    <Checkbox
                                      id={id}
                                      checked={checked.has(s.id)}
                                      onCheckedChange={() => toggle(s.id)}
                                    />
                                    <span>{s.name}</span>
                                  </label>
                                  <span className="text-sm text-muted-foreground">
                                    {s.cost_with_vat != null ? Number(s.cost_with_vat).toLocaleString() : "—"}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                          {saving ? "Saving…" : "Save privileges"}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="documents" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Документы</h3>
                      <span className="text-xs text-muted-foreground">
                        {grantedDocTypeIds.size} из {allDocTypes.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {allDocTypes.map((dt: any) => (
                        <div
                          key={dt.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-muted"
                        >
                          <Checkbox
                            checked={grantedDocTypeIds.has(dt.id)}
                            onCheckedChange={(checked) =>
                              toggleDocPrivilege(dt.id, checked as boolean)
                            }
                          />
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: dt.color || "gray" }}
                          />
                          <span className="text-sm">{dt.name_ru}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="rooms" className="mt-4">
                  {officeRooms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No office rooms configured for this hospital.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <ul className="space-y-1">
                        {officeRooms.map((r) => {
                          const id = `office-${r.id}`;
                          return (
                            <li
                              key={r.id}
                              className="flex items-center gap-3 rounded-md border px-3 py-2"
                            >
                              <label
                                htmlFor={id}
                                className="flex items-center gap-3 text-sm cursor-pointer flex-1"
                              >
                                <Checkbox
                                  id={id}
                                  checked={checkedRooms.has(r.id)}
                                  onCheckedChange={() => toggleRoom(r.id)}
                                />
                                <span>{r.name}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex justify-end">
                        <Button onClick={handleSaveRooms} disabled={savingRooms}>
                          {savingRooms ? "Saving…" : "Save assignments"}
                        </Button>
                      </div>
                    </div>
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
