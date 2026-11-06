import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Service { id: string; name: string; cost_with_vat: number | null }
interface RoomService {
  service_id: string;
  effective_from: string;
  services: Omit<Service, "id"> | null;
}
const money = (value: number | null) => value == null ? "—" : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RoomServicesSection({ roomId }: { roomId: string }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission("system.manage_settings");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RoomService | null>(null);

  const attached = useQuery({
    queryKey: ["room-services", roomId],
    enabled: !!roomId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("room_services")
        .select("service_id, effective_from, services(name, cost_with_vat)").eq("room_id", roomId);
      if (error) throw error;
      return (data ?? []) as unknown as RoomService[];
    },
  });
  const services = useQuery({
    queryKey: ["room-inpatient-services", user?.hospitalId],
    enabled: !!user && canManage,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("services")
        .select("id, name, cost_with_vat, service_types!inner(code)")
        .eq("hospital_id", user.hospitalId).eq("is_active", true)
        .eq("service_types.code", "inpatient").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Service[];
    },
  });
  const available = useMemo(() => {
    const ids = new Set((attached.data ?? []).map((service) => service.service_id));
    return (services.data ?? []).filter((service) => !ids.has(service.id));
  }, [attached.data, services.data]);

  const change = useMutation({
    mutationFn: async ({ serviceId, remove }: { serviceId: string; remove: boolean }) => {
      if (!canManage) throw new Error("Недостаточно прав");
      const { error } = await supabase.rpc(remove ? "remove_room_service" : "add_room_service", {
        p_room_id: roomId, p_service_id: serviceId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAdding(false);
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["room-services"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManage) return null;
  const loading = attached.isLoading || services.isLoading;
  const error = attached.error ?? services.error;
  return (
    <section className="space-y-3 border-t pt-4">
      {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : (
        <>
          {(attached.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Нет привязанных услуг</p>}
          {(attached.data ?? []).map((service) => (
            <div key={service.service_id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-medium">{service.services?.name ?? "—"}</p>
                <p className="text-muted-foreground">{money(service.services?.cost_with_vat ?? null)} · с {format(new Date(`${service.effective_from.slice(0, 10)}T00:00:00`), "dd.MM.yyyy")}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" className="shrink-0" title="Удалить услугу" aria-label={`Удалить услугу ${service.services?.name ?? ""}`} disabled={change.isPending} onClick={() => setRemoving(service)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {available.length === 0 ? <p className="text-sm text-muted-foreground">Нет доступных услуг типа «Стационар»</p> : adding ? (
            <Select disabled={change.isPending} onValueChange={(serviceId) => change.mutate({ serviceId, remove: false })}>
              <SelectTrigger aria-label="Услуга палаты"><SelectValue placeholder="Выберите услугу" /></SelectTrigger>
              <SelectContent>{available.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.cost_with_vat)}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} disabled={change.isPending}><Plus className="mr-2 h-4 w-4" />Добавить услугу</Button>}
        </>
      )}
      <p className="text-xs text-muted-foreground">Услуга начисляется пациенту за каждые календарные сутки пребывания в палате, начиная с сегодняшнего дня. Уже выставленные начисления не меняются.</p>
      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !change.isPending) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Удалить услугу палаты?</AlertDialogTitle><AlertDialogDescription>{removing?.services?.name}. Уже выставленные начисления не меняются.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={change.isPending} onClick={(event) => { event.preventDefault(); if (removing) change.mutate({ serviceId: removing.service_id, remove: true }); }}>{change.isPending ? "Удаление…" : "Удалить"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}