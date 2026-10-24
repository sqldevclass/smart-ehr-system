import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoomOptions } from "@/hooks/useRoomOptions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  isReadOnly: boolean;
  config: { departmentCode: string; roomTypeName: string };
}

export default function RoomSelectField({ value, onChange, isReadOnly, config }: Props) {
  const { data: rooms = [] } = useRoomOptions(config);
  const selectedRoom = rooms.find((room) => room.id === value);

  if (isReadOnly) {
    return (
      <div className="text-sm py-1.5">
        {selectedRoom?.name || value || (
          <span className="italic text-sm text-muted-foreground">Не заполнено</span>
        )}
      </div>
    );
  }

  const options = rooms.filter((room) => room.isActive || room.id === value);
  return (
    <div className="space-y-1.5">
      <Select value={selectedRoom ? value : ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
        <SelectContent>
          {options.map((room) => (
            <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">Нет доступных операционных</p>
      )}
    </div>
  );
}