import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PhysicianPrivilegesSection from "./PhysicianPrivilegesSection";
import ScheduleSection from "./ScheduleSection";

interface Props {
  personId: string;
  onClose: () => void;
}

export default function EmployeeDetail({ personId, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: person } = useQuery({
    queryKey: ["hr-person", personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("id", personId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: employment } = useQuery({
    queryKey: ["hr-employment", personId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employments")
        .select(`
          *,
          departments!department_id(id, name),
          job_titles!job_title_id(id, name),
          staff_types!staff_type_id(id, name),
          degrees!degree_id(id, name),
          qualifications!qualification_id(id, name)
        `)
        .eq("person_id", personId)
        .single();
      return data;
    },
    enabled: !!personId,
  });

  const { data: staffRoles = [] } = useQuery({
    queryKey: ["hr-staff-role", personId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_roles")
        .select(`
          id, role_type, specialization_id, department_id, is_active,
          specializations!specialization_id(id, name)
        `)
        .eq("person_id", personId)
        .eq("is_active", true)
        .order("role_type");
      return data || [];
    },
    enabled: !!personId,
  });

  const staffRole = staffRoles[0] ?? null;
  const isPhysician = staffRoles.some((sr: any) => sr.role_type === "physician");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Button>
        {person && (
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {person.last_name} {person.first_name} {person.middle_name || ""}
          </h1>
        )}
        {employment && employment.employment_status !== "active" && (
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            employment.employment_status === "fired"
              ? "bg-destructive/10 text-destructive"
              : "bg-yellow-100 text-yellow-800"
          )}>
            {employment.employment_status === "fired" ? "Уволен" : "Освобождён"}
          </span>
        )}
      </div>


      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Сотрудник</TabsTrigger>
          {staffRole && <TabsTrigger value="privileges">Привилегии</TabsTrigger>}
          {staffRole && staffRole.role_type === "physician" && <TabsTrigger value="schedule">График работы</TabsTrigger>}
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {person && employment ? (
            <EmployeeForm
              person={person}
              employment={employment}
              staffRole={staffRole}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["hr-person", personId] });
                queryClient.invalidateQueries({ queryKey: ["hr-employment", personId] });
                queryClient.invalidateQueries({ queryKey: ["hr-staff-role", personId] });
                queryClient.invalidateQueries({ queryKey: ["hr-employees-list"] });
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
        </TabsContent>

        {staffRole && (
          <TabsContent value="privileges" className="mt-4">
            <PhysicianPrivilegesSection
              staffRoleId={staffRole.id}
              hospitalId={user!.hospitalId}
            />
          </TabsContent>
        )}

        {staffRole && staffRole.role_type === "physician" && (
          <TabsContent value="schedule" className="mt-4">
            <ScheduleSection physicianId={staffRole.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function EmployeeForm({
  person, employment, staffRole, onSaved,
}: { person: any; employment: any; staffRole: any; onSaved: () => void }) {

  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [physForm, setPhysForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      first_name: person.first_name || "",
      last_name: person.last_name || "",
      middle_name: person.middle_name || "",
      date_of_birth: person.date_of_birth || "",
      gender: person.gender || "",
      phone: person.phone || "",
      email: person.email || "",
      address: person.address || "",
      employee_number: employment.employee_number || "",
      employed_since: employment.employed_since || "",
      department_id: employment.department_id || "",
      job_title_id: employment.job_title_id || "",
      staff_type_id: employment.staff_type_id || "",
      degree_id: employment.degree_id || "",
      qualification_id: employment.qualification_id || "",
    });
  }, [person, employment]);

  useEffect(() => {
    if (staffRole) {
      setPhysForm({
        specialization_id: staffRole.specialization_id || "",
        department_id: staffRole.department_id || "",
      });
    }
  }, [staffRole]);


  const setField = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const setPhysField = (k: string, v: any) => setPhysForm((p: any) => ({ ...p, [k]: v }));

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name")
        .eq("hospital_id", user!.hospitalId).order("name");
      return data || [];
    },
  });
  const { data: jobTitles = [] } = useQuery({
    queryKey: ["job_titles", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("job_titles").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
  });
  const { data: staffTypes = [] } = useQuery({
    queryKey: ["staff_types", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("staff_types").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
  });
  const { data: degrees = [] } = useQuery({
    queryKey: ["degrees", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("degrees").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
  });
  const { data: qualifications = [] } = useQuery({
    queryKey: ["qualifications", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("qualifications").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
  });
  const { data: specializations = [] } = useQuery({
    queryKey: ["specializations", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("specializations").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      const personPayload: any = {
        first_name: form.first_name,
        last_name: form.last_name,
        middle_name: form.middle_name || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      };
      const { error: personErr } = await supabase
        .from("persons")
        .update(personPayload)
        .eq("id", person.id);
      if (personErr) throw personErr;

      const empPayload: any = {
        employed_since: form.employed_since || null,
        department_id: form.department_id || null,
        job_title_id: form.job_title_id || null,
        staff_type_id: form.staff_type_id || null,
        degree_id: form.degree_id || null,
        qualification_id: form.qualification_id || null,
      };
      const { error: empErr } = await supabase
        .from("employments")
        .update(empPayload)
        .eq("id", employment.id);
      if (empErr) throw empErr;

      if (staffRole) {
        const physPayload: any = {};
        for (const k of Object.keys(physForm)) {
          physPayload[k] = physForm[k] === "" ? null : physForm[k];
        }
        const { error: srErr } = await supabase
          .from("staff_roles")
          .update(physPayload)
          .eq("id", staffRole.id);
        if (srErr) throw srErr;
      }
      toast.success("Сохранено");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };


  const handleStatusChange = async (
    newStatus: "fired" | "released" | "active"
  ) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("employments")
        .update({
          employment_status: newStatus,
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", employment.id);

      if (error) throw error;

      const { data: linkedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("person_id", person.id)
        .maybeSingle();

      if (newStatus !== "active" && linkedProfile?.id) {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = (supabase as any).supabaseUrl
          ?? "https://efgyjxanyqrlifjzznae.supabase.co";
        const supabaseKey = (supabase as any).supabaseKey
          ?? "sb_publishable_NAV4xE-ROrGKl_-FF1Dw2w_BZ4Vdjyz";

        const res = await fetch(
          `${supabaseUrl}/functions/v1/revoke-staff-access`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Authorization": `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ target_user_id: linkedProfile.id }),
          }
        );
        const data = await res.json();
        if (!res.ok && data.error !== "User access is already revoked") {
          throw new Error(data.error || "Failed to revoke access");
        }
      }


      toast.success(
        newStatus === "active"
          ? "Сотрудник восстановлен"
          : newStatus === "fired"
          ? "Сотрудник уволен"
          : "Сотрудник освобождён"
      );
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const sel = (label: string, value: string, onChange: (v: string) => void, opts: any[], placeholder = "—") => (

    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {opts.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Личные данные</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Фамилия</Label>
            <Input value={form.last_name || ""} onChange={(e) => setField("last_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Имя</Label>
            <Input value={form.first_name || ""} onChange={(e) => setField("first_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Отчество</Label>
            <Input value={form.middle_name || ""} onChange={(e) => setField("middle_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Дата рождения</Label>
            <Input type="date" value={form.date_of_birth || ""} onChange={(e) => setField("date_of_birth", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Пол</Label>
            <Select value={form.gender || undefined} onValueChange={(v) => setField("gender", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Мужской</SelectItem>
                <SelectItem value="female">Женский</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Телефон</Label>
            <Input value={form.phone || ""} onChange={(e) => setField("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label>
            <Input value={form.email || ""} onChange={(e) => setField("email", e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Адрес</Label>
            <Input value={form.address || ""} onChange={(e) => setField("address", e.target.value)} /></div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Трудоустройство</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Табельный номер</Label>
            <Input value={form.employee_number || ""} readOnly /></div>
          <div className="space-y-1.5"><Label>Дата приёма</Label>
            <Input type="date" value={form.employed_since || ""} onChange={(e) => setField("employed_since", e.target.value)} /></div>
          {sel("Отделение", form.department_id, (v) => setField("department_id", v), departments)}
          {sel("Должность", form.job_title_id, (v) => setField("job_title_id", v), jobTitles)}
          {sel("Тип персонала", form.staff_type_id, (v) => setField("staff_type_id", v), staffTypes)}
          {sel("Учёная степень", form.degree_id, (v) => setField("degree_id", v), degrees)}
          {sel("Квалификация", form.qualification_id, (v) => setField("qualification_id", v), qualifications)}
        </div>
      </section>

      {staffRole && (
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Клинические данные</h3>
          <div className="grid grid-cols-2 gap-3">
            {sel("Специализация", physForm.specialization_id, (v) => setPhysField("specialization_id", v), specializations)}
            {sel("Отделение врача", physForm.department_id, (v) => setPhysField("department_id", v), departments)}
          </div>
        </section>
      )}

      {staffRole && staffRole.role_type === "physician" && (
        <AssignedRoomsSection physicianId={staffRole.id} />
      )}


      <section className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Статус занятости</h3>
        {employment.employment_status === "active" ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={saving}
              onClick={() => handleStatusChange("fired")}
            >
              Уволить
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleStatusChange("released")}
            >
              Освободить
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {employment.employment_status === "fired" ? "Уволен" : "Освобождён"}
            </span>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleStatusChange("active")}
            >
              Восстановить
            </Button>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button>
      </div>

    </div>
  );
}

function AssignedRoomsSection({ physicianId }: { physicianId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const { data: assigned = [], refetch } = useQuery({
    queryKey: ["physician-rooms", physicianId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_room_physicians")
        .select("room_id, rooms!inner(id, name)")
        .eq("physician_id", physicianId)
        .eq("hospital_id", user!.hospitalId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: officeRooms = [] } = useQuery({
    queryKey: ["office-rooms-all", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_types!inner(is_office_room)")
        .eq("hospital_id", user!.hospitalId)
        .filter("room_types.is_office_room", "eq", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const assignedIds = new Set(assigned.map((a: any) => a.room_id));
  const available = (officeRooms as any[]).filter((r) => !assignedIds.has(r.id));

  const invalidate = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["hr-room", undefined] });
  };

  const handleAssign = async () => {
    if (!selectedRoomId) return;
    const { error } = await supabase.from("office_room_physicians").insert({
      room_id: selectedRoomId,
      physician_id: physicianId,
      hospital_id: user!.hospitalId,
      granted_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Кабинет назначен");
    setSelectedRoomId("");
    setShowAssign(false);
    invalidate();
  };

  const handleRemove = async (roomId: string) => {
    const { error } = await supabase.from("office_room_physicians").delete()
      .eq("physician_id", physicianId)
      .eq("room_id", roomId);
    if (error) { toast.error(error.message); return; }
    toast.success("Кабинет удалён");
    invalidate();
  };

  return (
    <section className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Назначенные кабинеты</h3>
        {!showAssign && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAssign(true)}>
            <Plus className="h-3 w-3" /> Назначить кабинет
          </Button>
        )}
      </div>

      {showAssign && (
        <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
          <Select value={selectedRoomId || undefined} onValueChange={setSelectedRoomId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Выберите кабинет" /></SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Нет доступных кабинетов</div>
              ) : (
                available.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAssign} disabled={!selectedRoomId}>Назначить</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAssign(false); setSelectedRoomId(""); }}>Отмена</Button>
        </div>
      )}

      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет назначенных кабинетов.</p>
      ) : (
        <ul className="space-y-1">
          {assigned.map((a: any) => (
            <li key={a.room_id} className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm">{a.rooms?.name}</span>
              <Button size="sm" variant="outline" className="text-destructive gap-1" onClick={() => handleRemove(a.room_id)}>
                <Minus className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
