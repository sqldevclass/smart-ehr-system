import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import ScheduleSection from "./ScheduleSection";

interface Props {
  roomId: string;
  onClose: () => void;
}

export default function RoomDetail({ roomId, onClose }: Props) {
  const { user } = useAuth();

  const { data: room } = useQuery({
    queryKey: ["hr-room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select(`
          id, name, is_active, department_id,
          room_types!inner(id, name),
          departments!department_id(name),
          office_room_physicians(
            physician_id,
            physicians!inner(
              id,
              profiles!inner(full_name),
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

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Назначенные врачи</h3>
                {((room as any).office_room_physicians || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет назначенных врачей.</p>
                ) : (
                  <ul className="space-y-1">
                    {((room as any).office_room_physicians || []).map((orp: any) => (
                      <li key={orp.physician_id} className="text-sm">
                        {orp.physicians?.profiles?.full_name || "—"}
                        {orp.physicians?.specializations?.name && (
                          <span className="text-muted-foreground"> · {orp.physicians.specializations.name}</span>
                        )}
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

  const assignedIds = new Set(assigned.map((a: any) => a.service_id));
  const available = allServices.filter((s: any) => !assignedIds.has(s.id));

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
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">Все услуги назначены.</p>
        ) : (
          <ul className="space-y-1">
            {available.map((s: any) => (
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
