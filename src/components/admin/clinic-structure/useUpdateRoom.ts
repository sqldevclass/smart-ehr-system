import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  const updateRoom = async (id: string, patch: Record<string, unknown>): Promise<boolean> => {
    try {
      const { error } = await supabase.from("rooms").update(patch).eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["clinic-structure"] });
      queryClient.invalidateQueries({ queryKey: ["office-room-services"] });
      return true;
    } catch (err: any) {
      toast.error(err.message || "Update failed.");
      return false;
    }
  };

  return updateRoom;
}
