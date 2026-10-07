export interface DailyNote {
  id: string;
  note_text: string;
  recorded_at: string;
  profiles?: { full_name?: string | null } | null;
}

/** One nursing daily note: when, who, and the text. */
export default function DailyNoteItem({ note }: { note: DailyNote }) {
  return (
    <div className="text-xs border-l-2 border-gray-300 pl-2 space-y-0.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{new Date(note.recorded_at).toLocaleString("ru-RU")}</span>
        {note.profiles?.full_name && <span>· {note.profiles.full_name}</span>}
      </div>
      <div>{note.note_text}</div>
    </div>
  );
}
