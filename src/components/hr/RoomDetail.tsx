import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Minus, Pencil } from "lucide-react";
import { toast } from "sonner";
import ScheduleSection from "./ScheduleSection";

interface Props {
  roomId: string;
  onClose: () => void;
}

export default function RoomDetail({ roomId, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: room, refetch: refetchRoom } = useQuery({
    queryKey: ["hr-room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select(`
          id, name, is_active, department_id,
          room_types!inner(id, name),
          departments!department_id(name),
          office_room_physicians(
            staff_role_id,
            staff_roles!inner(
              id,
              persons!inner(first_name, last_name),
              specializations!specialization_id(name)
            )
          )
        `)
        .eq("id", roomId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: allPhysicians = [] } = useQuery({
    queryKey: ["hr-physicians-active", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physicians")
        .select("id, profiles!inner(full_name), specializations!specialization_id(name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("profiles(full_name)");
      if (error) throw error;
      return data || [];
    },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", department_id: "", is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (room) setForm({
      name: room.name,
      department_id: (room as any).department_id ?? "",
      is_active: room.is_active,
    });
  }, [room]);

  const saveRoom = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("rooms").update({
        name: form.name,
        department_id: form.department_id || null,
        is_active: form.is_active,
      }).eq("id", roomId);
      if (error) throw error;
      toast.success("Сохранено");
      setEditing(false);
      refetchRoom();
      queryClient.invalidateQueries({ queryKey: ["hr-rooms-list"] });
    } catch (e: any) {
      toast.error(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const assignedPhysicians = ((room as any)?.office_room_physicians || []) as any[];
  const assignedPhysIds = new Set(assignedPhysicians.map((o) => o.physician_id));
  const availablePhysicians = (allPhysicians as any[]).filter((p) => !assignedPhysIds.has(p.id));

  const [showAssignPhysician, setShowAssignPhysician] = useState(false);
  const [selectedPhysicianId, setSelectedPhysicianId] = useState("");

  const assignPhysician = async () => {
    if (!selectedPhysicianId) return;
    const { error } = await supabase.from("office_room_physicians").insert({
      room_id: roomId,
      physician_id: selectedPhysicianId,
      hospital_id: user!.hospitalId,
      granted_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Врач назначен");
    setSelectedPhysicianId("");
    setShowAssignPhysician(false);
    refetchRoom();
  };

  const removePhysician = async (physicianId: string) => {
    const { error } = await supabase.from("office_room_physicians").delete()
      .eq("room_id", roomId)
      .eq("physician_id", physicianId);
    if (error) { toast.error(error.message); return; }
    toast.success("Врач удалён");
    refetchRoom();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Button>
        {room && (
          <h1 className="font-heading text-2xl font-bold text-foreground">{room.name}</h1>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Кабинет</TabsTrigger>
          <TabsTrigger value="services">Услуги</TabsTrigger>
          <TabsTrigger value="schedule">График работы</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {room ? (
            <section className="rounded-lg border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Информация о кабинете</h3>
                {!editing ? (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3" /> Редактировать
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Отмена</Button>
                    <Button size="sm" onClick={saveRoom} disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button>
                  </div>
                )}
              </div>

              {!editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Название</div>
                    <div className="font-medium">{room.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Тип</div>
                    <div className="font-medium">{(room as any).room_types?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Отделение</div>
                    <div className="font-medium">{(room as any).departments?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Статус</div>
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      room.is_active
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {room.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Название</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Отделение</Label>
                    <Select value={form.department_id || undefined} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Статус</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                      <span className="text-sm">{form.is_active ? "Активен" : "Неактивен"}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Назначенные врачи</h3>
                  {!showAssignPhysician && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAssignPhysician(true)}>
                      <Plus className="h-3 w-3" /> Назначить врача
                    </Button>
                  )}
                </div>

                {showAssignPhysician && (
                  <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
                    <Select value={selectedPhysicianId || undefined} onValueChange={setSelectedPhysicianId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Выберите врача" /></SelectTrigger>
                      <SelectContent>
                        {availablePhysicians.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">Нет доступных врачей</div>
                        ) : (
                          availablePhysicians.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.profiles?.full_name}
                              {p.specializations?.name ? ` · ${p.specializations.name}` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={assignPhysician} disabled={!selectedPhysicianId}>Назначить</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAssignPhysician(false); setSelectedPhysicianId(""); }}>Отмена</Button>
                  </div>
                )}

                {assignedPhysicians.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет назначенных врачей.</p>
                ) : (
                  <ul className="space-y-1">
                    {assignedPhysicians.map((orp: any) => (
                      <li key={orp.physician_id} className="flex items-center justify-between rounded-md border p-2">
                        <span className="text-sm">
                          {orp.physicians?.profiles?.full_name || "—"}
                          {orp.physicians?.specializations?.name && (
                            <span className="text-muted-foreground"> · {orp.physicians.specializations.name}</span>
                          )}
                        </span>
                        <Button size="sm" variant="outline" className="text-destructive gap-1" onClick={() => removePhysician(orp.physician_id)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <RoomServicesPanel roomId={roomId} hospitalId={user!.hospitalId} userId={user!.id} />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ScheduleSection roomId={roomId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoomServicesPanel({
  roomId, hospitalId, userId,
}: { roomId: string; hospitalId: string; userId: string }) {
  const queryClient = useQueryClient();
  const [serviceSearch, setServiceSearch] = useState("");

  const { data: assigned = [] } = useQuery({
    queryKey: ["hr-room-services", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_room_services")
        .select("service_id, services!inner(id, name)")
        .eq("room_id", roomId)
        .eq("hospital_id", hospitalId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ["services-active", hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const assignedServiceIds = new Set(assigned.map((a: any) => a.service_id));
  const filteredServices = (allServices || []).filter((s: any) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()) &&
    !assignedServiceIds.has(s.id)
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-room-services", roomId] });

  const add = async (serviceId: string) => {
    const { error } = await supabase.from("office_room_services").insert({
      room_id: roomId,
      service_id: serviceId,
      hospital_id: hospitalId,
      granted_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Услуга добавлена");
    invalidate();
  };

  const remove = async (serviceId: string) => {
    const { error } = await supabase.from("office_room_services").delete()
      .eq("room_id", roomId)
      .eq("service_id", serviceId);
    if (error) { toast.error(error.message); return; }
    toast.success("Услуга удалена");
    invalidate();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Назначенные услуги</h3>
        {assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет назначенных услуг.</p>
        ) : (
          <ul className="space-y-1">
            {assigned.map((a: any) => (
              <li key={a.service_id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{a.services?.name}</span>
                <Button size="sm" variant="outline" className="text-destructive gap-1" onClick={() => remove(a.service_id)}>
                  <Minus className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Доступные услуги</h3>
        <Input
          placeholder="Поиск услуг..."
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          className="mb-2"
        />
        {filteredServices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет доступных услуг.</p>
        ) : (
          <ul className="space-y-1">
            {filteredServices.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{s.name}</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => add(s.id)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
