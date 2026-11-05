import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ClinicBlock, ClinicFloor } from "./useClinicStructure";

const errorMessage = (err: unknown, fallback = "Не удалось сохранить") =>
  err && typeof err === "object" && "message" in err ? String(err.message) : fallback;

export function useStructureActions() {
  const { user, hasPermission } = useAuth();
  const canWrite = hasPermission("system.manage_settings");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    for (const key of ["clinic-structure", "departments", "departments-active", "departments-for-wh", "rooms", "warehouses"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const run = async (fn: () => Promise<{ error: unknown | null }>): Promise<boolean> => {
    if (!canWrite || !user) return false;
    setBusy(true);
    try {
      const result = await fn();
      if (result.error) throw result.error;
      toast.success("Сохранено");
      refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createBlock = (name: string, floors: number, basements: number): Promise<boolean> => {
    if (!name.trim()) { toast.error("Укажите название блока"); return Promise.resolve(false); }
    if (!Number.isInteger(floors) || floors < 0 || floors > 100) { toast.error("Количество этажей: целое число от 0 до 100"); return Promise.resolve(false); }
    if (!Number.isInteger(basements) || basements < 0 || basements > 10) { toast.error("Подвальных этажей: целое число от 0 до 10"); return Promise.resolve(false); }
    if (floors + basements < 1) { toast.error("Укажите хотя бы один этаж или подвал"); return Promise.resolve(false); }
    return run(() => supabase.rpc("create_clinic_block", { p_name: name.trim(), p_floors: floors, p_basements: basements }));
  };

  const renameBlock = (block: ClinicBlock, name: string): Promise<boolean> => {
    if (!name.trim()) { toast.error("Укажите название блока"); return Promise.resolve(false); }
    return run(() => supabase.from("clinic_blocks").update({ name: name.trim() }).eq("id", block.id).eq("hospital_id", user!.hospitalId));
  };

  const toggleBlock = (block: ClinicBlock): Promise<boolean> =>
    run(() => supabase.from("clinic_blocks").update({ is_active: !block.is_active }).eq("id", block.id).eq("hospital_id", user!.hospitalId));

  const addFloor = (block: ClinicBlock, number: number, label: string): Promise<boolean> => {
    if (!Number.isInteger(number) || number < -10 || number > 200) { toast.error("Номер этажа: целое число от -10 до 200"); return Promise.resolve(false); }
    return run(() => supabase.from("clinic_floors").insert({ hospital_id: user!.hospitalId, block_id: block.id, number, label: label.trim() || null }));
  };

  const setFloorLabel = (floor: ClinicFloor, label: string): Promise<boolean> =>
    run(() => supabase.from("clinic_floors").update({ label: label.trim() || null }).eq("id", floor.id).eq("hospital_id", user!.hospitalId));

  const deleteFloor = (floor: ClinicFloor): Promise<boolean> =>
    run(() => supabase.from("clinic_floors").delete().eq("id", floor.id).eq("hospital_id", user!.hospitalId));

  return { busy, canWrite, refresh, createBlock, renameBlock, toggleBlock, addFloor, setFloorLabel, deleteFloor };
}
