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
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import PhysicianPrivilegesSection from "./PhysicianPrivilegesSection";
import ScheduleSection from "./ScheduleSection";

interface Props {
  employeeId: string;
  onClose: () => void;
}

export default function EmployeeDetail({ employeeId, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: employee } = useQuery({
    queryKey: ["hr-employee", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          departments!department_id(id, name),
          job_titles!job_title_id(id, name),
          staff_types!staff_type_id(id, name),
          degrees!degree_id(id, name),
          qualifications!qualification_id(id, name)
        `)
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: physician } = useQuery({
    queryKey: ["hr-employee-physician", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select(`
          id, specialization_id, department_id, schedule_type, is_active,
          specializations!specialization_id(id, name)
        `)
        .eq("employee_id", employeeId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Button>
        {employee && (
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {employee.last_name} {employee.first_name} {employee.middle_name || ""}
          </h1>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Сотрудник</TabsTrigger>
          {physician && <TabsTrigger value="privileges">Привилегии</TabsTrigger>}
          {physician && <TabsTrigger value="schedule">График работы</TabsTrigger>}
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {employee ? (
            <EmployeeForm
              employee={employee}
              physician={physician}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["hr-employee", employeeId] });
                queryClient.invalidateQueries({ queryKey: ["hr-employee-physician", employeeId] });
                queryClient.invalidateQueries({ queryKey: ["hr-employees-list"] });
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
        </TabsContent>

        {physician && (
          <TabsContent value="privileges" className="mt-4">
            <PhysicianPrivilegesSection
              physicianId={physician.id}
              hospitalId={user!.hospitalId}
            />
          </TabsContent>
        )}

        {physician && (
          <TabsContent value="schedule" className="mt-4">
            <ScheduleSection physicianId={physician.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function EmployeeForm({
  employee, physician, onSaved,
}: { employee: any; physician: any; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [physForm, setPhysForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      first_name: employee.first_name || "",
      last_name: employee.last_name || "",
      middle_name: employee.middle_name || "",
      date_of_birth: employee.date_of_birth || "",
      gender: employee.gender || "",
      phone: employee.phone || "",
      email: employee.email || "",
      address: employee.address || "",
      employee_number: employee.employee_number || "",
      employed_since: employee.employed_since || "",
      department_id: employee.department_id || "",
      job_title_id: employee.job_title_id || "",
      staff_type_id: employee.staff_type_id || "",
      degree_id: employee.degree_id || "",
      qualification_id: employee.qualification_id || "",
    });
  }, [employee]);

  useEffect(() => {
    if (physician) {
      setPhysForm({
        specialization_id: physician.specialization_id || "",
        department_id: physician.department_id || "",
      });
    }
  }, [physician]);

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
      const payload: any = { ...form };
      delete payload.employee_number;
      for (const k of ["date_of_birth", "employed_since", "department_id", "job_title_id",
                       "staff_type_id", "degree_id", "qualification_id", "gender"]) {
        if (payload[k] === "") payload[k] = null;
      }
      const { error } = await supabase.from("employees").update(payload).eq("id", employee.id);
      if (error) throw error;

      if (physician) {
        const physPayload: any = { ...physForm };
        for (const k of Object.keys(physPayload)) if (physPayload[k] === "") physPayload[k] = null;
        const { error: pe } = await supabase.from("physicians").update(physPayload).eq("id", physician.id);
        if (pe) throw pe;
      }
      toast.success("Сохранено");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Не удалось сохранить");
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

      {physician && (
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Клинические данные</h3>
          <div className="grid grid-cols-2 gap-3">
            {sel("Специализация", physForm.specialization_id, (v) => setPhysField("specialization_id", v), specializations)}
            {sel("Отделение врача", physForm.department_id, (v) => setPhysField("department_id", v), departments)}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}
