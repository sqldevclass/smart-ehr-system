import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (personId: string) => void;
}


export default function AddEmployeeDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employedSince, setEmployedSince] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const { data: jobTitles = [] } = useQuery({
    queryKey: ["job_titles", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("job_titles").select("id, name")
        .eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name")
        .eq("hospital_id", user!.hospitalId).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const submit = async () => {
    if (!firstName || !lastName || !jobTitleId || !departmentId || !employedSince) {
      toast.error("Заполните все поля");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("employees").insert({
        hospital_id: user!.hospitalId,
        first_name: firstName,
        last_name: lastName,
        job_title_id: jobTitleId,
        department_id: departmentId,
        employed_since: employedSince,
        employee_number: "EMP-" + Date.now().toString().slice(-4),
        is_active: true,
      }).select("id").single();
      if (error) throw error;
      toast.success("Сотрудник добавлен");
      onOpenChange(false);
      onCreated(data.id);
      setFirstName(""); setLastName(""); setJobTitleId(""); setDepartmentId("");
    } catch (e: any) {
      toast.error(e.message || "Не удалось создать");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Добавить сотрудника</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Фамилия</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Имя</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Должность</Label>
            <Select value={jobTitleId} onValueChange={setJobTitleId}>
              <SelectTrigger><SelectValue placeholder="Выберите должность" /></SelectTrigger>
              <SelectContent>
                {jobTitles.map((j: any) => (
                  <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Отделение</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Выберите отделение" /></SelectTrigger>
              <SelectContent>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Дата приёма на работу</Label>
            <Input type="date" value={employedSince} onChange={(e) => setEmployedSince(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Сохранение…" : "Создать"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
