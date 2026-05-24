import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import RoomDetail from "@/components/hr/RoomDetail";

export default function HRRooms() {
  const { user } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["hr-rooms-list", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select(`
          id, name, is_active,
          room_types!inner(name, is_office_room)
        `)
        .eq("hospital_id", user!.hospitalId)
        .eq("room_types.is_office_room", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (!user) return null;

  if (selectedRoom) {
    return (
      <RoomDetail
        roomId={selectedRoom}
        onClose={() => setSelectedRoom(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Кабинеты</h1>
        <p className="text-sm text-muted-foreground">Управление кабинетами и их графиком работы.</p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Загрузка…</TableCell></TableRow>
            ) : rooms.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Кабинетов нет</TableCell></TableRow>
            ) : rooms.map((r: any) => (
              <TableRow
                key={r.id}
                onClick={() => setSelectedRoom(r.id)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.room_types?.name || "—"}</TableCell>
                <TableCell>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                    r.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {r.is_active ? "Активен" : "Неактивен"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
